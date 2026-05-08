import { spawn } from "child_process";
import type {
  CompletionRequest,
  CompletionResponse,
  ModelId,
} from "../../types/provider";
import type { ProviderConfig } from "../../types/config";
import { BaseProvider } from "../base";
import { parseCursorCliOutput } from "./parser";
import { withRetry } from "../../utils/retry";
import { logger } from "../../utils/logger";

// Cursor agent takes the prompt as a positional arg (not via stdin)
function spawnWithArg(
  cmd: string,
  args: string[],
  timeoutMs = 120000,
): Promise<string> {
  return new Promise((resolve, reject) => {
    logger.debug(`[cursor-cli] ${cmd} ${args.slice(0, -1).join(" ")} (prompt: ${args.at(-1)?.length ?? 0} chars)`);

    const child = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    const outChunks: Buffer[] = [];
    const errChunks: Buffer[] = [];

    child.stdout.on("data", (d: Buffer) => outChunks.push(d));
    child.stderr.on("data", (d: Buffer) => errChunks.push(d));

    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`${cmd} timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        const stdout = Buffer.concat(outChunks).toString().trim();
        const stderr = Buffer.concat(errChunks).toString().trim();
        const detail = [stderr, stdout].filter(Boolean).join(" | stdout: ");
        reject(new Error(`${cmd} exited with code ${code}: ${detail || "(no output)"}`));
      } else {
        resolve(Buffer.concat(outChunks).toString());
      }
    });
  });
}

export class CursorCliProvider extends BaseProvider {
  readonly id = "cursor-cli";
  readonly displayName = "Cursor CLI";

  private defaultModel: string;

  constructor(config: ProviderConfig) {
    super();
    this.defaultModel = config.defaultModel ?? "cursor-cli/gpt-4o";
  }

  async complete(req: CompletionRequest): Promise<CompletionResponse> {
    const start = Date.now();
    const model = normalizeModel(req.model || this.defaultModel);
    const prompt = buildPrompt(req);

    return withRetry(async () => {
      const args = [
        "agent",
        "--print",
        "--output-format", "text",
        "--model", model,
        prompt,
      ];

      const stdout = await spawnWithArg("cursor", args);
      return parseCursorCliOutput(stdout, req.model, Date.now() - start);
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
      "cursor-cli/claude-3-5-sonnet",
      "cursor-cli/claude-3-7-sonnet",
      "cursor-cli/gpt-4o",
      "cursor-cli/gemini-2.5-pro",
      "cursor-cli/o3",
    ];
  }

  async validateConfig(): Promise<void> {
    try {
      await spawnWithArg("cursor", ["--version"], 5000);
    } catch {
      throw new Error(
        "Cursor CLI not found. Install it from https://cursor.com or via: curl https://cursor.com/install -fsSL | bash",
      );
    }
  }
}

function normalizeModel(model: string): string {
  return model.replace(/^cursor-cli\//, "");
}

function buildPrompt(req: CompletionRequest): string {
  const parts: string[] = [];

  const systemMsg = req.messages.find((m) => m.role === "system");
  if (systemMsg) {
    parts.push(`<system>\n${systemMsg.content}\n</system>\n\n`);
  }

  for (const msg of req.messages.filter((m) => m.role !== "system")) {
    if (msg.role === "user") {
      parts.push(msg.content);
    } else if (msg.role === "assistant") {
      parts.push(`Assistant: ${msg.content}`);
    }
  }

  return parts.join("\n");
}
