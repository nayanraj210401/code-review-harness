import type { ModelId } from "./provider";
import type { ToolResult } from "./tool";

export type ReviewLevel = "quick" | "standard" | "deep";

export interface AgentConfig {
  id: string;
  name: string;
  description: string;
  triggers: string[];
  model: ModelId;
  temperature: number;
  maxTokens: number;
  reviewLevels: ReviewLevel[];
  allowedTools: string[];
  builtinSkills: string[];
  systemPrompt: string;
}

export interface AgentContext {
  diff?: string;
  files?: Array<{ path: string; content: string }>;
  astSummary?: string;
  dependencyGraph?: string;
  lintResults?: string;
  customContext?: Record<string, string>;
}

export interface AgentInput {
  reviewId: string;
  level: ReviewLevel;
  context: AgentContext;
  selectedSkills?: string[];
  depth?: number;
}

export interface Finding {
  id: string;
  agentId: string;
  severity: "critical" | "high" | "medium" | "low" | "info";
  category: string;
  title: string;
  description: string;
  suggestion: string;
  filePath?: string;
  lineStart?: number;
  lineEnd?: number;
  confidence: number;
  skillId?: string;
}

export interface AgentResult {
  agentId: string;
  agentName: string;
  model: ModelId;
  findings: Finding[];
  summary: string;
  tokensUsed: number;
  durationMs: number;
  toolCallsIssued: ToolResult[];
  isEphemeral?: boolean;
  error?: string;
}

export interface IAgent {
  readonly config: AgentConfig;
  run(input: AgentInput): Promise<AgentResult>;
  runDeep?(input: AgentInput, depth: number): Promise<AgentResult>;
}
