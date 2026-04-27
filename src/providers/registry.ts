import type { IProvider } from "../types/provider";
import type { CRHConfig } from "../types/config";
import { OpenRouterProvider } from "./openrouter";
import { ClaudeCliProvider } from "./claude-cli";
import { CodexCliProvider } from "./codex-cli";

const _providers = new Map<string, IProvider>();

export function initProviders(config: CRHConfig): void {
  _providers.clear();

  for (const [id, providerConfig] of Object.entries(config.providers)) {
    switch (id) {
      case "openrouter":
        _providers.set(id, new OpenRouterProvider(providerConfig));
        break;
      case "claude-cli":
        _providers.set(id, new ClaudeCliProvider(providerConfig));
        break;
      case "codex-cli":
        _providers.set(id, new CodexCliProvider(providerConfig));
        break;
    }
  }
}

export function getProvider(id: string): IProvider {
  const p = _providers.get(id);
  if (!p) throw new Error(`Provider "${id}" not registered. Run crh init or check your config.`);
  return p;
}

export function registerProvider(id: string, provider: IProvider): void {
  _providers.set(id, provider);
}

export function listProviders(): IProvider[] {
  return [..._providers.values()];
}
