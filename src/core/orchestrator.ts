import { EventEmitter } from "events";
import type { AgentResult, ReviewLevel } from "../types/agent";
import type { ReviewRequest, ReviewSession } from "../types/review";
import type { CRHConfig } from "../types/config";
import { generateId } from "../utils/id";
import { sha256 } from "../utils/hash";
import { logger } from "../utils/logger";
import { getDb } from "../state/db";
import { ReviewSessionRepo } from "../state/repositories/review-session.repo";
import { FindingRepo } from "../state/repositories/finding.repo";
import { AgentRunRepo } from "../state/repositories/agent-run.repo";
import { initProviders, getProvider } from "../providers/registry";
import { initTools, executeTool } from "../tools/registry";
import { initAgents, listAgentConfigs, createAgent, registerAgentConfig } from "../agents/registry";
import { initSkills, getSkillManifests } from "../skills/registry";
import { loadSkillContents } from "../skills/loader";
import { Router } from "./router";

export class Orchestrator extends EventEmitter {
  private sessionRepo!: ReviewSessionRepo;
  private findingRepo!: FindingRepo;
  private agentRunRepo!: AgentRunRepo;
  private config: CRHConfig;

  constructor(config: CRHConfig) {
    super();
    this.config = config;
    this.init();
  }

  private init(): void {
    const db = getDb(this.config.dbPath);
    this.sessionRepo = new ReviewSessionRepo(db);
    this.findingRepo = new FindingRepo(db);
    this.agentRunRepo = new AgentRunRepo(db);

    initProviders(this.config);
    initTools();
    initAgents(
      this.config.agentsDir,
      process.cwd() + "/.crh/agents",
    );
    initSkills(this.config.skillsDir);
  }

  async review(request: ReviewRequest): Promise<ReviewSession> {
    const sessionId = generateId();
    const startTime = Date.now();

    // Gather diff text for hashing + routing
    const diffText = await this.resolveDiff(request);
    const contextHash = sha256(diffText + request.level);

    // Cache check
    if (!request.noCache) {
      const cached = this.sessionRepo.findByHash(contextHash);
      if (cached) {
        logger.info(`Cache hit for session ${cached.id}`);
        this.emit("cache-hit", cached);
        return cached;
      }
    }

    const session: ReviewSession = {
      id: sessionId,
      createdAt: new Date().toISOString(),
      status: "pending",
      request,
      contextHash,
      agentResults: [],
      findings: [],
      summary: "",
      totalTokensUsed: 0,
      durationMs: 0,
    };

    this.sessionRepo.create(session);
    this.emit("session-created", session);

    try {
      // Step 1: Route
      session.status = "routing";
      this.sessionRepo.updateStatus(sessionId, "routing");
      this.emit("routing", session);

      const provider = getProvider(this.config.defaultProvider);
      const router = new Router(provider, this.config.router.model);
      const agentCatalog = listAgentConfigs();
      const skillCatalog = getSkillManifests();

      const routerDecision = this.config.router.enabled
        ? await router.decide(
            diffText,
            request.level,
            agentCatalog,
            skillCatalog,
            request.agentIds,
            request.skillIds,
          )
        : {
            selectedAgents: request.agentIds ?? agentCatalog.map((a) => a.id),
            selectedSkills: request.skillIds ?? [],
            suggestedTools: ["git-diff"],
            rationale: "Router disabled",
          };

      session.routerDecision = routerDecision;
      this.sessionRepo.updateStatus(sessionId, "gathering_context", {
        routerDecisionJson: JSON.stringify(routerDecision),
      });

      // Step 2: Gather context
      session.status = "gathering_context";
      this.emit("gathering-context", { session, routerDecision });

      const context = await this.gatherContext(diffText, request, routerDecision.suggestedTools);

      // Step 3: Load skill contents lazily
      const skillContents = await loadSkillContents(routerDecision.selectedSkills);

      // Step 4: Register any ephemeral agents from router
      for (const ephemeralConfig of routerDecision.ephemeralAgentConfigs ?? []) {
        registerAgentConfig({ ...ephemeralConfig, id: `ephemeral-${ephemeralConfig.id}` });
        routerDecision.selectedAgents.push(`ephemeral-${ephemeralConfig.id}`);
      }

      // Step 5: Run agents in parallel
      session.status = "running_agents";
      this.sessionRepo.updateStatus(sessionId, "running_agents");
      this.emit("running-agents", { session, selected: routerDecision.selectedAgents });

      const agentResults = await this.runAgents(
        sessionId,
        routerDecision.selectedAgents,
        request.level,
        context,
        skillContents,
      );

      session.agentResults = agentResults;

      // Step 6: Finalize
      session.status = "synthesizing";
      this.sessionRepo.updateStatus(sessionId, "synthesizing");

      const allFindings = agentResults.flatMap((r) => r.findings);
      const deduplicated = deduplicateFindings(allFindings);
      const totalTokens = agentResults.reduce((sum, r) => sum + r.tokensUsed, 0);
      const summary = buildSummary(agentResults, deduplicated);

      session.findings = deduplicated;
      session.totalTokensUsed = totalTokens;
      session.durationMs = Date.now() - startTime;
      session.summary = summary;
      session.completedAt = new Date().toISOString();
      session.status = "complete";

      this.sessionRepo.updateStatus(sessionId, "complete", {
        completedAt: session.completedAt,
        summary,
        totalTokens,
        durationMs: session.durationMs,
      });

      // Persist findings
      for (const result of agentResults) {
        if (result.findings.length > 0) {
          const runId = `${sessionId}:${result.agentId}`;
          this.findingRepo.createMany(result.findings, sessionId, runId);
        }
      }

      this.emit("complete", session);
      return session;
    } catch (err) {
      const errMsg = String(err);
      session.status = "failed";
      session.error = errMsg;
      session.durationMs = Date.now() - startTime;
      this.sessionRepo.updateStatus(sessionId, "failed", { error: errMsg });
      this.emit("failed", { session, error: err });
      throw err;
    }
  }

  private async resolveDiff(request: ReviewRequest): Promise<string> {
    if (request.diff) return request.diff;

    const result = await executeTool("git-diff", {
      args: request.diffArgs ?? ["HEAD~1", "HEAD"],
      files: request.files,
      maxLines: getLevelMaxLines(request.level),
    });

    if (!result.success) throw new Error(`Failed to get git diff: ${result.error}`);
    return (result.data as { diff: string }).diff;
  }

  private async gatherContext(
    diff: string,
    request: ReviewRequest,
    suggestedTools: string[],
  ) {
    const context: import("../types/agent").AgentContext = { diff };

    await Promise.all(
      suggestedTools
        .filter((t) => t !== "git-diff") // already have diff
        .map(async (toolName) => {
          const result = await executeTool(toolName, {});
          if (result.success) {
            if (toolName === "lint-runner") context.lintResults = String(result.data);
          }
        }),
    );

    return context;
  }

  private async runAgents(
    sessionId: string,
    agentIds: string[],
    level: ReviewLevel,
    context: import("../types/agent").AgentContext,
    skillContents: Map<string, string>,
  ): Promise<AgentResult[]> {
    const provider = getProvider(this.config.defaultProvider);
    const allConfigs = listAgentConfigs();
    const configMap = new Map(allConfigs.map((c) => [c.id, c]));

    const tasks = agentIds
      .map((id) => configMap.get(id))
      .filter((c): c is NonNullable<typeof c> => c !== undefined)
      .filter((c) => c.reviewLevels.includes(level));

    if (tasks.length === 0) {
      logger.warn("No agents available for this level, using all configured agents");
    }

    const results = await Promise.allSettled(
      tasks.map(async (config) => {
        const runId = `${sessionId}:${config.id}`;
        this.agentRunRepo.create(runId, sessionId, config.id, config.name, config.model);

        // Build skill contents relevant to this agent
        const agentSkillContents = new Map<string, string>();
        for (const skillId of [...config.builtinSkills, ...skillContents.keys()]) {
          if (skillContents.has(skillId)) {
            agentSkillContents.set(skillId, skillContents.get(skillId)!);
          }
        }

        const agent = createAgent(config, provider, agentSkillContents);
        this.emit("agent-start", { agentId: config.id, agentName: config.name });

        const result = await agent.run({ reviewId: sessionId, level, context });

        this.agentRunRepo.complete(runId, result);
        this.emit("agent-complete", { agentId: config.id, findingCount: result.findings.length });

        return result;
      }),
    );

    return results
      .filter((r): r is PromiseFulfilledResult<AgentResult> => r.status === "fulfilled")
      .map((r) => r.value);
  }
}

function getLevelMaxLines(level: ReviewLevel): number {
  return level === "quick" ? 500 : level === "standard" ? 2000 : 10000;
}

function deduplicateFindings(findings: import("../types/agent").Finding[]) {
  const seen = new Set<string>();
  return findings.filter((f) => {
    const key = `${f.filePath ?? ""}:${f.lineStart ?? 0}:${f.category}:${f.title.slice(0, 30)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function buildSummary(results: AgentResult[], findings: import("../types/agent").Finding[]): string {
  const bySeverity = findings.reduce(
    (acc, f) => {
      acc[f.severity] = (acc[f.severity] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  const counts = ["critical", "high", "medium", "low", "info"]
    .filter((s) => bySeverity[s])
    .map((s) => `${bySeverity[s]} ${s}`)
    .join(", ");

  const agentNames = results.map((r) => r.agentName).join(", ");
  return `${findings.length} findings (${counts || "none"}) from ${results.length} agents: ${agentNames}`;
}
