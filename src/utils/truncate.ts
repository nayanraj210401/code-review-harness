const CHARS_PER_TOKEN = 4;

export function truncateToTokens(text: string, maxTokens: number): string {
  const maxChars = maxTokens * CHARS_PER_TOKEN;
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars) + "\n\n[... truncated ...]";
}

export function truncateLines(text: string, maxLines: number): string {
  const lines = text.split("\n");
  if (lines.length <= maxLines) return text;
  return (
    lines.slice(0, maxLines).join("\n") +
    `\n\n[... ${lines.length - maxLines} more lines truncated ...]`
  );
}
