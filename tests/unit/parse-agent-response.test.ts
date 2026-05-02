import { parseAgentResponse } from "../../src/utils/parse-agent-response";

const validResponse = JSON.stringify({
  findings: [
    {
      severity: "high",
      category: "Security",
      title: "SQL Injection",
      description: "Unsanitized input passed to query",
      suggestion: "Use parameterized queries",
      confidence: 0.9,
    },
  ],
  summary: "Found 1 issue",
});

describe("parseAgentResponse", () => {
  describe("successful parse", () => {
    it("returns findings and summary with no error", () => {
      const result = parseAgentResponse(`\`\`\`json\n${validResponse}\n\`\`\``);
      expect(result.error).toBeUndefined();
      expect(result.findings).toHaveLength(1);
      expect(result.findings[0].title).toBe("SQL Injection");
      expect(result.summary).toBe("Found 1 issue");
    });

    it("returns empty findings array when findings list is empty", () => {
      const content = '```json\n{"findings": [], "summary": "clean"}\n```';
      const result = parseAgentResponse(content);
      expect(result.error).toBeUndefined();
      expect(result.findings).toEqual([]);
      expect(result.summary).toBe("clean");
    });
  });

  describe("no JSON found", () => {
    it("returns error when content has no JSON", () => {
      const result = parseAgentResponse("I reviewed the code and found no issues.");
      expect(result.error).toBe("no JSON found in response");
      expect(result.findings).toEqual([]);
    });

    it("includes prose as summary when no JSON found", () => {
      const prose = "I reviewed the code and found no issues.";
      const result = parseAgentResponse(prose);
      expect(result.summary).toBe(prose.slice(0, 200));
    });
  });

  describe("malformed JSON", () => {
    it("returns error when JSON fails schema validation (missing required fields)", () => {
      const content = '```json\n{"findings": [{"title": "x"}], "summary": "s"}\n```';
      const result = parseAgentResponse(content);
      expect(result.error).toMatch(/failed to parse JSON response/);
      expect(result.findings).toEqual([]);
    });

    it("returns error when JSON is syntactically invalid", () => {
      const content = '```json\n{invalid json here}\n```';
      const result = parseAgentResponse(content);
      expect(result.error).toMatch(/failed to parse JSON response/);
    });
  });

  describe("code fences in descriptions (original bug)", () => {
    it("correctly parses findings that contain SQL code blocks in descriptions", () => {
      const withCodeBlock = JSON.stringify({
        findings: [
          {
            severity: "high",
            category: "Security",
            title: "SQL Injection",
            description: "Replace:\n```sql\nSELECT * FROM users WHERE id = '$id'\n```\nwith parameterized queries",
            suggestion: "Use prepared statements",
          },
        ],
        summary: "Found SQL injection",
      });
      const result = parseAgentResponse(`\`\`\`json\n${withCodeBlock}\n\`\`\``);
      expect(result.error).toBeUndefined();
      expect(result.findings[0].description).toContain("```sql");
    });
  });
});
