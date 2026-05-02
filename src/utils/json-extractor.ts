// Extracts the first balanced JSON object from model output.
// Scanning braces (while respecting string literals) handles models that include
// code fences like ```sql inside description strings, which break regex-based extraction.
export function extractJsonFromContent(content: string): string | null {
  const fenceIdx = content.search(/```(?:json)?\s*\n/);
  const start = content.indexOf("{", fenceIdx >= 0 ? fenceIdx : 0);
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < content.length; i++) {
    const c = content[i];
    if (escape) { escape = false; continue; }
    if (inString) {
      if (c === "\\") escape = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') { inString = true; continue; }
    if (c === "{") depth++;
    if (c === "}") { if (--depth === 0) return content.slice(start, i + 1); }
  }
  return null;
}
