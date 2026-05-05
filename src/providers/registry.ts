import type { IProvider } from "../types/provider";
import type { CRHConfig } from "../types/config";
import { OpenRouterProvider } from "./openrouter";
import { ClaudeCliProvider } from "./claude-cli";
import { CodexCliProvider } from "./codex-cli";
import { CursorCliProvider } from "./cursor-cli";

const _providers = new Map<string, IProvider>();
let _defaultProviderId = "openrouter";

export function initProviders(config: CRHConfig): void {
  _providers.clear();
  _defaultProviderId = config.defaultProvider;

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
      case "cursor-cli":
        _providers.set(id, new CursorCliProvider(providerConfig));
        break;
    }
  }
}

export function getProvider(id: string): IProvider {
  const p = _providers.get(id);
  if (!p) throw new Error(`Provider "${id}" not registered. Run crh init or check your config.`);
  return p;
}

/**
 * Route a model string to the right provider.
 *
 * Prefixed model IDs are always routed to their named provider:
 *   claude-cli/claude-opus-4-5  → ClaudeCliProvider
 *   codex-cli/gpt-4o            → CodexCliProvider
 *   openrouter/google/gemini-…  → OpenRouterProvider
 *
 * Unprefixed model IDs (e.g. "anthropic/claude-opus-4-5", "gpt-4o") fall
 * back to the configured defaultProvider so existing agent configs just work.
 */
export function getProviderForModel(model: string): IProvider {
  if (model.startsWith("claude-cli/") && _providers.has("claude-cli")) {
    return _providers.get("claude-cli")!;
  }
  if (model.startsWith("codex-cli/") && _providers.has("codex-cli")) {
    return _providers.get("codex-cli")!;
  }
  if (model.startsWith("cursor-cli/") && _providers.has("cursor-cli")) {
    return _providers.get("cursor-cli")!;
  }
  if (model.startsWith("openrouter/") && _providers.has("openrouter")) {
    return _providers.get("openrouter")!;
  }
  // No explicit prefix — use the configured default
  return getProvider(_defaultProviderId);
}

export function registerProvider(id: string, provider: IProvider): void {
  _providers.set(id, provider);
}

export function listProviders(): IProvider[] {
  return [..._providers.values()];
}
