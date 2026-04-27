import type {
  CompletionRequest,
  CompletionResponse,
  ModelId,
} from "../../types/provider";
import type { ProviderConfig } from "../../types/config";
import { BaseProvider } from "../base";
import { OpenRouterClient } from "./client";

export class OpenRouterProvider extends BaseProvider {
  readonly id = "openrouter";
  readonly displayName = "OpenRouter";

  private client: OpenRouterClient;

  constructor(config: ProviderConfig) {
    super();
    const apiKey =
      config.apiKey ?? process.env.OPENROUTER_API_KEY ?? "";
    if (!apiKey) {
      throw new Error(
        "OpenRouter API key not found. Set OPENROUTER_API_KEY or configure providers.openrouter.apiKey",
      );
    }
    this.client = new OpenRouterClient(apiKey, config.baseUrl);
  }

  async complete(req: CompletionRequest): Promise<CompletionResponse> {
    return this.client.complete(req);
  }

  async listModels(): Promise<ModelId[]> {
    return this.client.listModels();
  }

  async validateConfig(): Promise<void> {
    await this.client.validateApiKey();
  }
}
