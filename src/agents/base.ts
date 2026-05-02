import type {
  AgentConfig,
  AgentInput,
  AgentResult,
  Finding,
  IAgent,
} from "../types/agent";
import type { SkillManifest } from "../types/skill";
import type { Message } from "../types/provider";
import type { ToolResult } from "../types/tool";
import { executeTool } from "../tools/base";
import { getProviderForModel } from "../providers/registry";
import { generateId } from "../utils/id";
import { logger } from "../utils/logger";
import { truncateToTokens } from "../utils/truncate";
import { extractJsonFromContent } from "../utils/json-extractor";
import { parseAgentResponse } from "../utils/parse-agent-response";

export { extractJsonFromContent };

export class BaseAgent implements IAgent {
  constructor(readonly config: AgentConfig) {}

  async run(input: AgentInput): Promise<AgentResult> {
    const start = Date.now();
    const toolCallsIssued: ToolResult[] = [];
    // Skills loaded during this run (id → content)
    const activeSkills = new Map<string, string>();

    try {
      const provider = getProviderForModel(this.config.model);
      const systemPrompt = this.buildSystemPrompt(input, activeSkills);
      const userPrompt = this.buildUserPrompt(input);

      let messages: Message[] = [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ];

      let finalContent = "";
      const maxRounds = 8; // extra rounds for skill loading

      for (let round = 0; round < maxRounds; round++) {
        const response = await provider.complete({
          model: this.config.model,
          messages,
          temperature: this.config.temperature,
          maxTokens: this.config.maxTokens,
        });

        finalContent = response.content;

        const toolCall = extractToolCall(finalContent);
        if (!toolCall) break;

        logger.debug(`[${this.config.id}] tool: ${toolCall.name}`);

        // ── Runtime skill management ──────────────────────────────────────
        if (toolCall.name === "request_skill") {
          const skillId = String(toolCall.input.id ?? "");
          const loader = input.skillLoader;

          if (!skillId) {
            pushToolResult(messages, toolCall.name, { error: "Missing skill id" });
            continue;
          }

          if (activeSkills.has(skillId)) {
            pushToolResult(messages, toolCall.name, { alreadyLoaded: true, skillId });
            continue;
          }

          const content = loader ? await loader(skillId) : null;
          if (!content) {
            pushToolResult(messages, toolCall.name, {
              error: `Skill "${skillId}" not found. Available: ${(input.skillCatalog ?? []).map((s) => s.id).join(", ")}`,
            });
            continue;
          }

          activeSkills.set(skillId, content);
          logger.debug(`[${this.config.id}] loaded skill "${skillId}" at runtime`);
          // Inject skill content as the tool result so the agent can immediately use it
          messages = [
            ...messages,
            { role: "assistant" as const, content: finalContent } as Message,
            {
              role: "user" as const,
              content: `Tool result for request_skill:\nSkill "${skillId}" loaded successfully.\n\n${content}`,
            } as Message,
          ];
          continue;
        }

        if (toolCall.name === "synthesize_skill") {
          const { name, instructions } = toolCall.input as {
            name?: string;
            instructions?: string;
          };
          if (!name || !instructions) {
            pushToolResult(messages, toolCall.name, { error: "name and instructions are required" });
            continue;
          }
          const ephemeralId = `ephemeral-${name.toLowerCase().replace(/\W+/g, "-")}`;
          activeSkills.set(ephemeralId, instructions);
          logger.debug(`[${this.config.id}] synthesized ephemeral skill "${ephemeralId}"`);
          messages = [
            ...messages,
            { role: "assistant" as const, content: finalContent } as Message,
            {
              role: "user" as const,
              content: `Tool result for synthesize_skill:\nCustom skill "${name}" created.\n\n${instructions}`,
            } as Message,
          ];
          continue;
        }

        // ── Standard tool dispatch ────────────────────────────────────────
        const toolResult = await executeTool(toolCall.name, toolCall.input);
        toolCallsIssued.push(toolResult);

        messages = [
          ...messages,
          { role: "assistant" as const, content: finalContent } as Message,
          {
            role: "user" as const,
            content: `Tool result for ${toolCall.name}:\n${JSON.stringify(toolResult.data, null, 2)}`,
          } as Message,
        ];
      }

      const { findings, summary, tokensUsed, error } = this.parseResponse(finalContent, input);

      return {
        agentId: this.config.id,
        agentName: this.config.name,
        model: this.config.model,
        findings,
        summary,
        tokensUsed,
        durationMs: Date.now() - start,
        toolCallsIssued,
        error,
      };
    } catch (err) {
      logger.error(`Agent ${this.config.id} failed: ${err}`);
      return {
        agentId: this.config.id,
        agentName: this.config.name,
        model: this.config.model,
        findings: [],
        summary: "",
        tokensUsed: 0,
        durationMs: Date.now() - start,
        toolCallsIssued,
        error: String(err),
      };
    }
  }

  private buildSystemPrompt(
    input: AgentInput,
    activeSkills: Map<string, string>,
  ): string {
    const parts: string[] = [this.config.systemPrompt];

    // Skill catalog — metadata only (level 1). Agent decides what to load.
    const catalog = input.skillCatalog ?? [];
    if (catalog.length > 0) {
      const suggested = new Set(input.suggestedSkillIds ?? []);
      const rows = catalog.map((s) => {
        const hint = suggested.has(s.id) ? " ⭐ (router suggests)" : "";
        return `  - ${s.id}: ${s.description}${hint}`;
      });
      parts.push(
        "\n\n---\n## Available Skills\n" +
        "You may load any skill below at runtime using the `request_skill` tool.\n" +
        "The router has pre-suggested skills marked ⭐ but you are free to request others.\n\n" +
        rows.join("\n"),
      );
    }

    // Already-active skills are listed (they start empty; content arrives via tool results)
    if (activeSkills.size > 0) {
      parts.push("\n\n---\n## Currently Active Skills\n" + [...activeSkills.keys()].join(", "));
    }

    // Standard context tools
    const tools = [...this.config.allowedTools, "request_skill", "synthesize_skill"];
    parts.push(
      "\n\n---\n## Tools\n" +
      "Call a tool by including a JSON block in your response:\n" +
      "```tool-call\n{\"name\": \"<tool>\", \"input\": {...}}\n```\n\n" +
      "Available tools:\n" +
      `  - ${this.config.allowedTools.join(", ")} — context gathering\n` +
      "  - request_skill {id} — load full skill content into your context\n" +
      "  - synthesize_skill {name, instructions} — create an ephemeral skill checklist for a domain not covered by the catalog",
    );

    parts.push(
      '\n\n---\n## Output Format\n' +
      'When you have finished your review (after loading any needed skills), respond with valid JSON:\n' +
      '```json\n{"findings": [...], "summary": "..."}\n```\n\n' +
      'Each finding: {"severity": "critical|high|medium|low|info", "category": "string", "title": "string", "description": "string", "suggestion": "string", "filePath"?: "string", "lineStart"?: number, "lineEnd"?: number, "confidence"?: number, "skillId"?: "string"}',
    );

    return parts.join("\n");
  }

  private buildUserPrompt(input: AgentInput): string {
    const parts: string[] = [
      `Review the following code changes. Level: ${input.level}\n`,
    ];

    if (input.context.diff) {
      const maxTokens =
        input.level === "quick" ? 4000 : input.level === "standard" ? 8000 : 24000;
      parts.push(
        `\n## Git Diff\n\`\`\`diff\n${truncateToTokens(input.context.diff, maxTokens)}\n\`\`\``,
      );
    }

    if (input.context.lintResults) {
      parts.push(`\n## Lint Results\n${input.context.lintResults}`);
    }

    if (input.context.astSummary) {
      parts.push(`\n## AST Summary\n${input.context.astSummary}`);
    }

    if ((input.suggestedSkillIds ?? []).length > 0) {
      parts.push(
        `\n## Router Skill Suggestions\nThe router suggests these skills may be relevant: ${input.suggestedSkillIds!.join(", ")}. ` +
        `Use \`request_skill\` to load any you need.`,
      );
    }

    return parts.join("\n");
  }

  private parseResponse(
    content: string,
    input: AgentInput,
  ): { findings: Finding[]; summary: string; tokensUsed: number; error?: string } {
    const { findings: raw, summary, error } = parseAgentResponse(content);

    if (error) {
      logger.warn(`[${this.config.id}] ${error}`);
      return { findings: [], summary, tokensUsed: 0, error };
    }

    const findings: Finding[] = raw.map((f) => ({
      ...f,
      id: generateId(),
      agentId: this.config.id,
      confidence: f.confidence ?? 1.0,
    }));

    return {
      findings,
      summary,
      tokensUsed: estimateTokens(content) + estimateTokens(input.context.diff ?? ""),
    };
  }
}

function extractToolCall(
  content: string,
): { name: string; input: Record<string, unknown> } | null {
  const match = content.match(/```tool-call\s*([\s\S]*?)```/);
  if (!match) return null;
  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}

function pushToolResult(messages: Message[], toolName: string, data: unknown): void {
  messages.push({
    role: "user" as const,
    content: `Tool result for ${toolName}:\n${JSON.stringify(data, null, 2)}`,
  } as Message);
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
