import type { AgentResult, Finding, ReviewLevel } from "./agent";
import type { ModelId } from "./provider";

export type ReviewStatus =
  | "pending"
  | "gathering_context"
  | "routing"
  | "running_agents"
  | "deliberating"
  | "synthesizing"
  | "complete"
  | "failed";

export interface ReviewRequest {
  diff?: string;
  diffArgs?: string[];
  files?: string[];
  level: ReviewLevel;
  agentIds?: string[];
  skillIds?: string[];
  format: "json" | "markdown" | "pretty" | "sarif";
  councilMode?: boolean;
  councilChairModel?: ModelId;
  outputFile?: string;
  noCache?: boolean;
  verbose?: boolean;
}

export interface RouterDecision {
  selectedAgents: string[];
  selectedSkills: string[];
  suggestedTools: string[];
  ephemeralAgentConfigs?: import("./agent").AgentConfig[];
  rationale: string;
}

export interface ReviewSession {
  id: string;
  createdAt: string;
  completedAt?: string;
  status: ReviewStatus;
  request: ReviewRequest;
  contextHash: string;
  routerDecision?: RouterDecision;
  agentResults: AgentResult[];
  findings: Finding[];
  councilResult?: import("./council").CouncilResult;
  summary: string;
  totalTokensUsed: number;
  durationMs: number;
  error?: string;
}
