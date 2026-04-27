import axios, { type AxiosInstance } from "axios";
import type {
  CompletionRequest,
  CompletionResponse,
} from "../../types/provider";
import { withRetry } from "../../utils/retry";

export class OpenRouterClient {
  private http: AxiosInstance;

  constructor(
    private apiKey: string,
    baseUrl = "https://openrouter.ai/api/v1",
  ) {
    this.http = axios.create({
      baseURL: baseUrl,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://github.com/review-harness",
        "X-Title": "review-harness",
      },
      timeout: 120000,
    });
  }

  async complete(req: CompletionRequest): Promise<CompletionResponse> {
    return withRetry(
      async () => {
        const res = await this.http.post("/chat/completions", {
          model: req.model,
          messages: req.messages,
          temperature: req.temperature ?? 0.3,
          max_tokens: req.maxTokens ?? 8192,
          stop: req.stopSequences,
        });

        const choice = res.data.choices?.[0];
        if (!choice) throw new Error("No completion choice returned");

        const usage = res.data.usage ?? {};
        return {
          content: choice.message?.content ?? "",
          model: res.data.model ?? req.model,
          usage: {
            promptTokens: usage.prompt_tokens ?? 0,
            completionTokens: usage.completion_tokens ?? 0,
            totalTokens: usage.total_tokens ?? 0,
          },
          finishReason:
            choice.finish_reason === "stop"
              ? "stop"
              : choice.finish_reason === "length"
                ? "length"
                : "error",
          rawResponse: res.data,
        };
      },
      {
        maxAttempts: 3,
        baseDelayMs: 1000,
        shouldRetry: (err) => {
          if (axios.isAxiosError(err)) {
            const status = err.response?.status ?? 0;
            return status === 429 || status >= 500;
          }
          return false;
        },
      },
    );
  }

  async listModels(): Promise<string[]> {
    const res = await this.http.get("/models");
    return (res.data.data ?? []).map(
      (m: { id: string }) => m.id,
    );
  }

  async validateApiKey(): Promise<void> {
    await this.http.get("/models");
  }
}
