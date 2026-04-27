import { readFileSync } from "fs";
import { join } from "path";
import matter from "gray-matter";
import type { ISkill, SkillManifest, SkillResult } from "../types/skill";
import type { AgentContext } from "../types/agent";

export class FileSkill implements ISkill {
  readonly manifest: SkillManifest;
  private filePath: string;

  constructor(filePath: string) {
    this.filePath = filePath;
    const raw = readFileSync(filePath, "utf8");
    const { data } = matter(raw);
    this.manifest = {
      id: data.id as string,
      name: data.name as string,
      description: data.description as string,
      triggers: (data.triggers as string[]) ?? [],
      mode: (data.mode as SkillManifest["mode"]) ?? "inline",
      model: data.model as string | undefined,
      author: data.author as string | undefined,
      version: data.version as string | undefined,
    };
  }

  async loadContent(): Promise<string> {
    const raw = readFileSync(this.filePath, "utf8");
    const { content } = matter(raw);
    return content.trim();
  }

  async execute(_context: AgentContext): Promise<SkillResult> {
    // Default execution: load content and return it as a summary
    // The orchestrator handles routing to BaseAgent for subagent mode
    const content = await this.loadContent();
    return {
      skillId: this.manifest.id,
      mode: this.manifest.mode,
      summary: content.slice(0, 500),
      durationMs: 0,
    };
  }
}
