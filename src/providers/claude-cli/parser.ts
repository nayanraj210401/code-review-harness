import type { CompletionResponse, ModelId } from "../../types/provider";

export function parseClaudeCliOutput(
  stdout: string,
  model: ModelId,
  durationMs: number,
): CompletionResponse {
  // Claude CLI --print outputs the assistant response directly
  // Strip any ANSI color codes
  const content = stdout.replace(/\x1b\[[0-9;]*m/g, "").trim();

  return {
    content,
    model,
    usage: {
      // CLI doesn't expose token counts; estimate
      promptTokens: 0,
      completionTokens: Math.ceil(content.length / 4),
      totalTokens: Math.ceil(content.length / 4),
    },
    finishReason: "stop",
  };
}
