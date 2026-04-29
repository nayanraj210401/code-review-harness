import { spawn } from "child_process";
import type {
  CompletionRequest,
  CompletionResponse,
  ModelId,
} from "../../types/provider";
import type { ProviderConfig } from "../../types/config";
import { BaseProvider } from "../base";
import { parseClaudeCliOutput } from "./parser";
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
    const errChunks: Buffer[] = [];

    child.stdout.on("data", (d: Buffer) => chunks.push(d));
    child.stderr.on("data", (d: Buffer) => errChunks.push(d));

    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`${cmd} timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(`${cmd} exited with code ${code}: ${Buffer.concat(errChunks).toString().trim()}`));
      } else {
        resolve(Buffer.concat(chunks).toString());
      }
    });

    child.stdin.write(input);
    child.stdin.end();
  });
}

export class ClaudeCliProvider extends BaseProvider {
  readonly id = "claude-cli";
  readonly displayName = "Claude CLI";

  private defaultModel: string;

  constructor(config: ProviderConfig) {
    super();
    this.defaultModel = config.defaultModel ?? "claude-claude-opus-4-5";
  }

  async complete(req: CompletionRequest): Promise<CompletionResponse> {
    const start = Date.now();
    const model = normalizeModel(req.model || this.defaultModel);

    // Build the prompt: system + conversation history as a single string
    const prompt = buildPrompt(req);

    return withRetry(async () => {
      const args = [
        "--model", model,
        "--print",           // non-interactive, print response to stdout
      ];

      const stdout = await spawnWithInput("claude", args, prompt);
      return parseClaudeCliOutput(stdout, req.model, Date.now() - start);
    });
  }

  // CLI-backed provider runs requests sequentially to avoid spawning too many processes
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
      "claude-cli/claude-opus-4-5",
      "claude-cli/claude-sonnet-4-5",
      "claude-cli/claude-haiku-4-5",
    ];
  }

  async validateConfig(): Promise<void> {
    try {
      await spawnWithInput("claude", ["--version"], "", 5000);
    } catch {
      throw new Error(
        "Claude CLI not found. Install it from https://claude.ai/download or via npm: npm i -g @anthropic-ai/claude-code",
      );
    }
  }
}

function normalizeModel(model: string): string {
  // Strip "claude-cli/" prefix if present
  return model.replace(/^claude-cli\//, "");
}

function buildPrompt(req: CompletionRequest): string {
  const parts: string[] = [];

  // Include system message in the prompt
  const systemMsg = req.messages.find((m) => m.role === "system");
  if (systemMsg) {
    parts.push(`<system>\n${systemMsg.content}\n</system>\n\n`);
  }

  // Include conversation history
  for (const msg of req.messages.filter((m) => m.role !== "system")) {
    if (msg.role === "user") {
      parts.push(msg.content);
    } else if (msg.role === "assistant") {
      parts.push(`Assistant: ${msg.content}`);
    }
  }

  return parts.join("\n");
}
