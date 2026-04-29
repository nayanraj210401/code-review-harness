import { spawn } from "child_process";
import type {
  CompletionRequest,
  CompletionResponse,
  ModelId,
} from "../../types/provider";
import type { ProviderConfig } from "../../types/config";
import { BaseProvider } from "../base";
import { parseCodexCliOutput } from "./parser";
import { withRetry } from "../../utils/retry";

function spawnWithInput(
  cmd: string,
  args: string[],
  input: string,
  timeoutMs = 120000,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ["pipe", "pipe", "pipe"] });
    const chunks: Buffer[] = [];
    const timer = setTimeout(() => { child.kill(); reject(new Error(`${cmd} timed out`)); }, timeoutMs);
    child.stdout.on("data", (d: Buffer) => chunks.push(d));
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) reject(new Error(`${cmd} exited with code ${code}`));
      else resolve(Buffer.concat(chunks).toString());
    });
    if (input) { child.stdin.write(input); }
    child.stdin.end();
  });
}

export class CodexCliProvider extends BaseProvider {
  readonly id = "codex-cli";
  readonly displayName = "Codex CLI";

  private defaultModel: string;

  constructor(config: ProviderConfig) {
    super();
    this.defaultModel = config.defaultModel ?? "codex-cli/o4-mini";
  }

  async complete(req: CompletionRequest): Promise<CompletionResponse> {
    const model = normalizeModel(req.model || this.defaultModel);
    const prompt = buildPrompt(req);

    return withRetry(async () => {
      const args = ["--model", model, "--quiet"];
      const stdout = await spawnWithInput("codex", args, prompt);
      return parseCodexCliOutput(stdout, req.model);
    });
  }

  async completeMany(
    requests: CompletionRequest[],
  ): Promise<CompletionResponse[]> {
    const results: CompletionResponse[] = [];
    for (const req of requests) {
      results.push(await this.complete(req));
    }
    return results;
  }

  async listModels(): Promise<ModelId[]> {
    return [
      "codex-cli/o4-mini",
      "codex-cli/o3",
      "codex-cli/gpt-4.1",
    ];
  }

  async validateConfig(): Promise<void> {
    try {
      await spawnWithInput("codex", ["--version"], "", 5000);
    } catch {
      throw new Error(
        "Codex CLI not found. Install it: npm i -g @openai/codex",
      );
    }
  }
}

function normalizeModel(model: string): string {
  // Strip provider prefixes — agents may use openrouter-style IDs (e.g. openai/gpt-4o)
  return model.replace(/^(codex-cli|openai)\//, "");
}

function buildPrompt(req: CompletionRequest): string {
  const systemMsg = req.messages.find((m) => m.role === "system");
  const userMsgs = req.messages.filter((m) => m.role === "user");

  const parts: string[] = [];
  if (systemMsg) parts.push(systemMsg.content);
  if (userMsgs.length > 0) parts.push(userMsgs.map((m) => m.content).join("\n\n"));

  return parts.join("\n\n---\n\n");
}
