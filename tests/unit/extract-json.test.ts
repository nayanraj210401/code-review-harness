import { extractJsonFromContent } from "../../src/utils/json-extractor";

describe("extractJsonFromContent", () => {
  it("extracts JSON from a plain code fence", () => {
    const content = '```json\n{"findings": [], "summary": "ok"}\n```';
    expect(extractJsonFromContent(content)).toBe('{"findings": [], "summary": "ok"}');
  });

  it("extracts JSON from an unlabelled code fence", () => {
    const content = '```\n{"findings": [], "summary": "ok"}\n```';
    expect(extractJsonFromContent(content)).toBe('{"findings": [], "summary": "ok"}');
  });

  it("extracts JSON when description contains a code fence (the original bug)", () => {
    const content =
      '```json\n' +
      '{"findings": [{"title": "SQL Injection", "description": "Replace:\\n```sql\\nSELECT * FROM users WHERE id = $id\\n```\\nwith parameterized queries"}], "summary": "found issues"}\n' +
      "```";
    const result = extractJsonFromContent(content);
    expect(result).not.toBeNull();
    const parsed = JSON.parse(result!);
    expect(parsed.findings[0].title).toBe("SQL Injection");
  });

  it("extracts JSON when description contains backtick inline code", () => {
    const content =
      '```json\n{"findings": [{"description": "Use `parameterized queries`"}], "summary": "s"}\n```';
    const result = extractJsonFromContent(content);
    expect(result).not.toBeNull();
    expect(JSON.parse(result!).findings[0].description).toBe("Use `parameterized queries`");
  });

  it("extracts JSON with no fence (bare object)", () => {
    const result = extractJsonFromContent('Here is my analysis: {"findings": [], "summary": "none"}');
    expect(result).not.toBeNull();
    expect(JSON.parse(result!).summary).toBe("none");
  });

  it("handles escaped quotes inside strings", () => {
    const content = '```json\n{"findings": [], "summary": "he said \\"hello\\""}\n```';
    const result = extractJsonFromContent(content);
    expect(result).not.toBeNull();
    expect(JSON.parse(result!).summary).toBe('he said "hello"');
  });

  it("handles escaped backslash followed by quote (double escape)", () => {
    const content = '```json\n{"findings": [], "summary": "path c:\\\\\\\\dir"}\n```';
    const result = extractJsonFromContent(content);
    expect(result).not.toBeNull();
    expect(() => JSON.parse(result!)).not.toThrow();
  });

  it("returns null when content has no JSON object", () => {
    expect(extractJsonFromContent("No JSON here at all")).toBeNull();
  });

  it("returns null when opening brace has no matching close", () => {
    // No closing } — the scanner exhausts the string and returns null
    expect(extractJsonFromContent('```json\n{"findings": [\n```')).toBeNull();
  });

  it("extracts the first complete object when fence is absent and prose contains braces", () => {
    // Without a fence, the extractor starts at the first { — but that first object
    // will fail JSON.parse in the caller, and the caller returns an error. This test
    // just verifies the extractor itself returns a balanced string in that case.
    const content = '{"findings": [], "summary": "ok"} and some trailing text';
    const result = extractJsonFromContent(content);
    expect(result).toBe('{"findings": [], "summary": "ok"}');
  });

  it("handles nested objects inside findings", () => {
    const content =
      '```json\n{"findings": [{"meta": {"line": 1}}], "summary": "s"}\n```';
    const result = extractJsonFromContent(content);
    expect(result).not.toBeNull();
    expect(JSON.parse(result!).findings[0].meta.line).toBe(1);
  });
});
