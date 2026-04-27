import { existsSync, readdirSync, readFileSync } from "fs";
import { join } from "path";
import matter from "gray-matter";
import type { AgentConfig, ReviewLevel } from "../types/agent";
import type { IProvider } from "../types/provider";
import { BaseAgent } from "./base";
import { logger } from "../utils/logger";

const _configs = new Map<string, AgentConfig>();

const BUILTINS_DIR = join(__dirname, "builtins");

export function initAgents(
  userAgentsDir?: string,
  projectAgentsDir?: string,
): void {
  _configs.clear();

  // Load order: builtins → user (~/.crh/agents/) → project (.crh/agents/)
  loadFromDir(BUILTINS_DIR);
  if (userAgentsDir && existsSync(userAgentsDir)) loadFromDir(userAgentsDir);
  if (projectAgentsDir && existsSync(projectAgentsDir)) loadFromDir(projectAgentsDir);

  logger.debug(`Agent registry: ${_configs.size} agents loaded`);
}

function loadFromDir(dir: string): void {
  if (!existsSync(dir)) return;
  const files = readdirSync(dir).filter((f) => f.endsWith(".md"));
  for (const file of files) {
    try {
      const raw = readFileSync(join(dir, file), "utf8");
      const { data, content } = matter(raw);
      const config: AgentConfig = {
        id: data.id as string,
        name: data.name as string,
        description: data.description as string,
        triggers: (data.triggers as string[]) ?? [],
        model: (data.model as string) ?? "anthropic/claude-opus-4-5",
        temperature: (data.temperature as number) ?? 0.3,
        maxTokens: (data.maxTokens as number) ?? 8192,
        reviewLevels: ((data.reviewLevels as string[]) ?? ["quick", "standard", "deep"]) as ReviewLevel[],
        allowedTools: (data.allowedTools as string[]) ?? ["git-diff", "file-reader"],
        builtinSkills: (data.builtinSkills as string[]) ?? [],
        systemPrompt: content.trim(),
      };
      _configs.set(config.id, config);
    } catch (err) {
      logger.warn(`Failed to load agent ${file}: ${err}`);
    }
  }
}

export function getAgentConfig(id: string): AgentConfig | undefined {
  return _configs.get(id);
}

export function listAgentConfigs(): AgentConfig[] {
  return [..._configs.values()];
}

export function createAgent(
  config: AgentConfig,
  provider: IProvider,
  injectedSkills: Map<string, string> = new Map(),
): BaseAgent {
  return new BaseAgent(config, provider, injectedSkills);
}

export function registerAgentConfig(config: AgentConfig): void {
  _configs.set(config.id, config);
}
