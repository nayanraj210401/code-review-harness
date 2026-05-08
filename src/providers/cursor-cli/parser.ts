import type { CompletionResponse, ModelId } from "../../types/provider";

export function parseCursorCliOutput(
  stdout: string,
  model: ModelId,
  durationMs?: number,
): CompletionResponse {
  const content = stdout.replace(/\x1b\[[0-9;]*m/g, "").trim();

  return {
    content,
    model,
    usage: {
      promptTokens: 0,
      completionTokens: Math.ceil(content.length / 4),
      totalTokens: Math.ceil(content.length / 4),
    },
    finishReason: "stop",
  };
}
