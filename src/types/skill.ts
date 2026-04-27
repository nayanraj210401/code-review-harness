import type { Finding } from "./agent";
import type { AgentContext } from "./agent";

export type SkillMode = "inline" | "subagent" | "tool";

export interface SkillManifest {
  id: string;
  name: string;
  description: string;
  triggers: string[];
  mode: SkillMode;
  model?: string;
  author?: string;
  version?: string;
}

export interface SkillResult {
  skillId: string;
  mode: SkillMode;
  findings?: Finding[];
  summary?: string;
  data?: unknown;
  durationMs: number;
}

export interface ISkill {
  readonly manifest: SkillManifest;
  loadContent(): Promise<string>;
  loadArtifacts?(): Promise<Record<string, string>>;
  execute(context: AgentContext): Promise<SkillResult>;
}
