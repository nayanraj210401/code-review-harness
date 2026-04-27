import type { AgentConfig, ReviewLevel } from "../types/agent";
import type { SkillManifest } from "../types/skill";
import type { RouterDecision } from "../types/review";
import type { IProvider } from "../types/provider";
import { truncateToTokens } from "../utils/truncate";
import { logger } from "../utils/logger";

const MAX_AGENTS: Record<ReviewLevel, number> = {
  quick: 2,
  standard: 5,
  deep: 99,
};

export class Router {
  constructor(
    private provider: IProvider,
    private model: string,
  ) {}

  async decide(
    diff: string,
    level: ReviewLevel,
    agentCatalog: AgentConfig[],
    skillCatalog: SkillManifest[],
    forceAgentIds?: string[],
    forceSkillIds?: string[],
  ): Promise<RouterDecision> {
    // If user forced specific agents/skills, skip the router LLM call
    if (forceAgentIds?.length && forceSkillIds?.length) {
      return {
        selectedAgents: forceAgentIds,
        selectedSkills: forceSkillIds,
        suggestedTools: ["git-diff", "file-reader"],
        rationale: "User-specified agents and skills (bypassing router)",
      };
    }

    const maxAgents = MAX_AGENTS[level];
    const diffSummary = truncateToTokens(diff, 2000);

    const agentList = agentCatalog
      .map((a) => `- ${a.id}: ${a.description} [triggers: ${a.triggers.slice(0, 5).join(", ")}]`)
      .join("\n");

    const skillList = skillCatalog
      .map((s) => `- ${s.id}: ${s.description} [triggers: ${s.triggers.slice(0, 5).join(", ")}]`)
      .join("\n");

    const systemPrompt = `You are a code review routing agent. Given a git diff and a catalog of expert agents and skills, select the most relevant ones for this review.

Return ONLY valid JSON, no prose, no markdown.`;

    const userPrompt = `Review level: ${level} (max ${maxAgents} agents)

Git diff (summary):
\`\`\`diff
${diffSummary}
\`\`\`

Available agents:
${agentList}

Available skills:
${skillList}

Select agents and skills most relevant to this diff. For "deep" level you may also synthesize ephemeral agent configs for novel domains not covered above.

Return JSON exactly:
{
  "selectedAgents": ["id1", "id2"],
  "selectedSkills": ["id1", "id2"],
  "suggestedTools": ["git-diff", "file-reader"],
  "ephemeralAgentConfigs": [],
  "rationale": "brief explanation"
}`;

    try {
      const response = await this.provider.complete({
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

      // Enforce level cap
      if (decision.selectedAgents.length > maxAgents) {
        decision.selectedAgents = decision.selectedAgents.slice(0, maxAgents);
      }

      // Apply forced overrides
      if (forceAgentIds?.length) decision.selectedAgents = forceAgentIds;
      if (forceSkillIds?.length) decision.selectedSkills = forceSkillIds;

      logger.debug(`Router selected: ${decision.selectedAgents.join(", ")} | skills: ${decision.selectedSkills.join(", ")}`);
      return decision;
    } catch (err) {
      logger.warn(`Router failed (${err}), falling back to defaults`);
      return fallbackDecision(level, agentCatalog, skillCatalog, forceAgentIds, forceSkillIds);
    }
  }
}

function extractJson(content: string): string {
  const match = content.match(/```(?:json)?\s*([\s\S]*?)```/) ??
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
  const defaultAgentOrder = ["security", "correctness", "performance", "architecture", "testing", "style", "documentation"];

  const selectedAgents = forceAgentIds ??
    defaultAgentOrder
      .filter((id) => agents.some((a) => a.id === id))
      .slice(0, maxAgents);

  const selectedSkills = forceSkillIds ??
    skills
      .filter((s) => ["owasp-top10", "sql-injection", "big-o-analysis"].includes(s.id))
      .map((s) => s.id);

  return {
    selectedAgents,
    selectedSkills,
    suggestedTools: ["git-diff", "file-reader"],
    rationale: "Fallback defaults (router unavailable)",
  };
}
