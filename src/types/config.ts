import type { ReviewLevel } from "./agent";

export interface ProviderConfig {
  id: string;
  apiKey?: string;
  baseUrl?: string;
  defaultModel: string;
  rateLimit?: {
    requestsPerMinute: number;
    tokensPerMinute: number;
  };
}

export interface AgentPresetConfig {
  id: string;
  enabled: boolean;
  model?: string;
  temperature?: number;
}

export interface SkillPresetConfig {
  id: string;
  enabled: boolean;
}

export interface CRHConfig {
  version: number;
  defaultProvider: string;
  defaultLevel: ReviewLevel;
  defaultFormat: "json" | "markdown" | "pretty" | "sarif";
  router: {
    model: string;
    enabled: boolean;
  };
  providers: Record<string, ProviderConfig>;
  agents: Record<string, AgentPresetConfig>;
  skills: Record<string, SkillPresetConfig>;
  councilMode: {
    enabled: boolean;
    defaultMembers: string[];
    chairModel: string;
    rounds: number;
  };
  dbPath: string;
  skillsDir: string;
  agentsDir: string;
  logLevel: "debug" | "info" | "warn" | "error";
  telemetry: boolean;
}
