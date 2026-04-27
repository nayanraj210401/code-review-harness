import { z } from "zod";
import type {
  AgentConfig,
  AgentInput,
  AgentResult,
  Finding,
  IAgent,
} from "../types/agent";
import type { IProvider, Message } from "../types/provider";
import type { ToolResult } from "../types/tool";
import { executeTool } from "../tools/base";
import { generateId } from "../utils/id";
import { logger } from "../utils/logger";
import { truncateToTokens } from "../utils/truncate";

const FindingSchema = z.object({
  severity: z.enum(["critical", "high", "medium", "low", "info"]),
  category: z.string(),
  title: z.string(),
  description: z.string(),
  suggestion: z.string(),
  filePath: z.string().optional(),
  lineStart: z.number().int().optional(),
  lineEnd: z.number().int().optional(),
  confidence: z.number().min(0).max(1).optional(),
  skillId: z.string().optional(),
});

const ResponseSchema = z.object({
  findings: z.array(FindingSchema),
  summary: z.string(),
});

export class BaseAgent implements IAgent {
  constructor(
    readonly config: AgentConfig,
    private provider: IProvider,
    private injectedSkillContent: Map<string, string> = new Map(),
  ) {}

  async run(input: AgentInput): Promise<AgentResult> {
    const start = Date.now();
    const toolCallsIssued: ToolResult[] = [];

    try {
      const systemPrompt = this.buildSystemPrompt(input);
      const userPrompt = this.buildUserPrompt(input);

      let messages: Message[] = [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ];

      let finalContent = "";
      const maxRounds = 5;

      for (let round = 0; round < maxRounds; round++) {
        const response = await this.provider.complete({
          model: this.config.model,
          messages,
          temperature: this.config.temperature,
          maxTokens: this.config.maxTokens,
        });

        finalContent = response.content;

        // Check if agent is requesting a tool call
        const toolCall = extractToolCall(finalContent);
        if (!toolCall) break;

        logger.debug(`[${this.config.id}] tool call: ${toolCall.name}`);
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

      const { findings, summary, tokensUsed } = this.parseResponse(
        finalContent,
        input,
      );

      return {
        agentId: this.config.id,
        agentName: this.config.name,
        model: this.config.model,
        findings,
        summary,
        tokensUsed,
        durationMs: Date.now() - start,
        toolCallsIssued,
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

  private buildSystemPrompt(input: AgentInput): string {
    const parts: string[] = [this.config.systemPrompt];

    // Inject pre-selected skill content (level 2)
    if (this.injectedSkillContent.size > 0) {
      parts.push("\n\n---\n## Active Skills\n");
      for (const [skillId, content] of this.injectedSkillContent) {
        parts.push(`### Skill: ${skillId}\n${content}`);
      }
    }

    // List all other available tools (level 1 metadata only)
    if (this.config.allowedTools.length > 0) {
      parts.push(
        "\n\n---\n## Available Tools\nYou may call these tools by including a JSON block in your response:\n" +
          "```tool-call\n{\"name\": \"<tool-name>\", \"input\": {...}}\n```\n\n" +
          "Available: " +
          this.config.allowedTools.join(", "),
      );
    }

    parts.push(
      '\n\n---\n## Output Format\nYou MUST respond with valid JSON matching this schema:\n```json\n{"findings": [...], "summary": "..."}\n```\n\n' +
        'Each finding: {"severity": "critical|high|medium|low|info", "category": "string", "title": "string", "description": "string", "suggestion": "string", "filePath"?: "string", "lineStart"?: number, "lineEnd"?: number, "confidence"?: number}',
    );

    return parts.join("\n");
  }

  private buildUserPrompt(input: AgentInput): string {
    const parts: string[] = [
      `Review the following code changes. Level: ${input.level}\n`,
    ];

    if (input.context.diff) {
      const maxTokens = input.level === "quick" ? 4000 : input.level === "standard" ? 8000 : 24000;
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

    return parts.join("\n");
  }

  private parseResponse(
    content: string,
    input: AgentInput,
  ): { findings: Finding[]; summary: string; tokensUsed: number } {
    // Extract JSON from response — look for code block or raw JSON
    const jsonMatch =
      content.match(/```(?:json)?\s*([\s\S]*?)```/) ??
      content.match(/(\{[\s\S]*\})/);

    if (!jsonMatch) {
      logger.warn(`[${this.config.id}] no JSON found in response`);
      return { findings: [], summary: content.slice(0, 200), tokensUsed: 0 };
    }

    try {
      const parsed = ResponseSchema.parse(JSON.parse(jsonMatch[1]));
      const findings: Finding[] = parsed.findings.map((f) => ({
        ...f,
        id: generateId(),
        agentId: this.config.id,
        confidence: f.confidence ?? 1.0,
      }));
      return {
        findings,
        summary: parsed.summary,
        tokensUsed: estimateTokens(content) + estimateTokens(input.context.diff ?? ""),
      };
    } catch (err) {
      logger.warn(`[${this.config.id}] failed to parse JSON response: ${err}`);
      return { findings: [], summary: "", tokensUsed: 0 };
    }
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

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
