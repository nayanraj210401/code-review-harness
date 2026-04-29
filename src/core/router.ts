import type { AgentConfig, ReviewLevel } from "../types/agent";
import type { SkillManifest } from "../types/skill";
import type { RouterDecision } from "../types/review";
import type { DiffSummary } from "../tools/diff-summarizer";
import { formatDiffSummaryForRouter } from "../tools/diff-summarizer";
import { getProviderForModel } from "../providers/registry";
import { logger } from "../utils/logger";

const MAX_AGENTS: Record<ReviewLevel, number> = {
  quick: 2,
  standard: 5,
  deep: 99,
};

export class Router {
  constructor(private model: string) {}

  async decide(
    diffSummary: DiffSummary,
    level: ReviewLevel,
    agentCatalog: AgentConfig[],
    skillCatalog: SkillManifest[],
    forceAgentIds?: string[],
    forceSkillIds?: string[],
  ): Promise<RouterDecision> {
    if (forceAgentIds?.length && forceSkillIds?.length) {
      return {
        selectedAgents: forceAgentIds,
        suggestedSkills: forceSkillIds,
        suggestedTools: ["git-diff", "file-reader"],
        rationale: "User-specified agents and skills (bypassing router)",
      };
    }

    const maxAgents = MAX_AGENTS[level];

    const agentList = agentCatalog
      .map((a) => `- ${a.id}: ${a.description} [triggers: ${a.triggers.slice(0, 5).join(", ")}]`)
      .join("\n");

    const skillList = skillCatalog
      .map((s) => `- ${s.id}: ${s.description} [triggers: ${s.triggers.slice(0, 5).join(", ")}]`)
      .join("\n");

    const systemPrompt = `You are a code review routing agent. Given a structured diff summary and a catalog of expert agents and skills, select the most relevant agents and suggest skills that might be useful.

Agents will receive the full diff. Skills are lazy-loaded — only suggest ones likely relevant based on the diff tokens and languages. Agents will decide at runtime whether to actually load each skill.

Return ONLY valid JSON, no prose, no markdown.`;

    const userPrompt = `Review level: ${level} (max ${maxAgents} agents)

${formatDiffSummaryForRouter(diffSummary)}

Available agents:
${agentList}

Available skills (suggestions only — agents load them at runtime):
${skillList}

${level === "deep" ? "Deep mode: you may also synthesize ephemeral agent configs for novel domains not covered by the catalog." : ""}

Return JSON exactly:
{
  "selectedAgents": ["id1", "id2"],
  "suggestedSkills": ["id1", "id2"],
  "suggestedTools": ["git-diff", "file-reader"],
  "ephemeralAgentConfigs": [],
  "rationale": "brief explanation"
}`;

    try {
      const provider = getProviderForModel(this.model);
      const response = await provider.complete({
        model: this.model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.1,
        maxTokens: 1024,
      });

      const json = extractJson(response.content);
      const decision = JSON.parse(json) as RouterDecision;

      if (decision.selectedAgents.length > maxAgents) {
        decision.selectedAgents = decision.selectedAgents.slice(0, maxAgents);
      }

      if (forceAgentIds?.length) decision.selectedAgents = forceAgentIds;
      if (forceSkillIds?.length) decision.suggestedSkills = forceSkillIds;

      logger.debug(
        `Router selected: ${decision.selectedAgents.join(", ")} | skill hints: ${(decision.suggestedSkills ?? []).join(", ")}`,
      );
      return decision;
    } catch (err) {
      logger.warn(`Router failed (${err}), falling back to defaults`);
      return fallbackDecision(level, agentCatalog, skillCatalog, forceAgentIds, forceSkillIds);
    }
  }
}

function extractJson(content: string): string {
  const match =
    content.match(/```(?:json)?\s*([\s\S]*?)```/) ??
    content.match(/(\{[\s\S]*\})/);
  return match ? match[1].trim() : content.trim();
}

function fallbackDecision(
  level: ReviewLevel,
  agents: AgentConfig[],
  skills: SkillManifest[],
  forceAgentIds?: string[],
  forceSkillIds?: string[],
): RouterDecision {
  const maxAgents = MAX_AGENTS[level];
  const defaultOrder = ["security", "correctness", "performance", "architecture", "testing", "style", "documentation"];

  const selectedAgents =
    forceAgentIds ??
    defaultOrder
      .filter((id) => agents.some((a) => a.id === id))
      .slice(0, maxAgents);

  const suggestedSkills =
    forceSkillIds ??
    skills
      .filter((s) => ["owasp-top10", "sql-injection", "big-o-analysis"].includes(s.id))
      .map((s) => s.id);

  return {
    selectedAgents,
    suggestedSkills,
    suggestedTools: ["git-diff", "file-reader"],
    rationale: "Fallback defaults (router unavailable)",
  };
}
