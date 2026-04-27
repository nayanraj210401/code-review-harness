import type { IFormatter } from "./base";
import type { ReviewSession } from "../types/review";
import type { Finding } from "../types/agent";

const SEVERITY_LEVEL: Record<string, string> = {
  critical: "error",
  high: "error",
  medium: "warning",
  low: "note",
  info: "note",
};

export const sarifFormatter: IFormatter = {
  name: "sarif",
  mimeType: "application/sarif+json",
  fileExtension: ".sarif.json",

  format(session: ReviewSession): string {
    const rules = buildRules(session.findings);
    const results = session.findings.map((f) => buildResult(f));

    const sarif = {
      $schema: "https://schemastore.azurewebsites.net/schemas/json/sarif-2.1.0-rtm.5.json",
      version: "2.1.0",
      runs: [
        {
          tool: {
            driver: {
              name: "review-harness",
              version: "0.1.0",
              informationUri: "https://github.com/review-harness",
              rules,
            },
          },
          results,
        },
      ],
    };

    return JSON.stringify(sarif, null, 2);
  },
};

function buildRules(findings: Finding[]) {
  const seen = new Set<string>();
  const rules = [];
  for (const f of findings) {
    const ruleId = ruleIdFor(f);
    if (seen.has(ruleId)) continue;
    seen.add(ruleId);
    rules.push({
      id: ruleId,
      name: f.title.replace(/[^a-zA-Z0-9]/g, ""),
      shortDescription: { text: f.title },
      fullDescription: { text: f.description },
      defaultConfiguration: {
        level: SEVERITY_LEVEL[f.severity] ?? "note",
      },
      properties: {
        category: f.category,
        severity: f.severity,
      },
    });
  }
  return rules;
}

function buildResult(f: Finding) {
  const result: Record<string, unknown> = {
    ruleId: ruleIdFor(f),
    level: SEVERITY_LEVEL[f.severity] ?? "note",
    message: { text: `${f.description}\n\nSuggestion: ${f.suggestion}` },
  };

  if (f.filePath) {
    result.locations = [
      {
        physicalLocation: {
          artifactLocation: { uri: f.filePath, uriBaseId: "%SRCROOT%" },
          region: {
            startLine: f.lineStart ?? 1,
            endLine: f.lineEnd ?? f.lineStart ?? 1,
          },
        },
      },
    ];
  }

  result.properties = {
    agentId: f.agentId,
    confidence: f.confidence,
    skillId: f.skillId,
  };

  return result;
}

function ruleIdFor(f: Finding): string {
  return `CRH-${f.category.toUpperCase().replace(/[^A-Z0-9]/g, "-")}-${f.title.slice(0, 20).toUpperCase().replace(/[^A-Z0-9]/g, "-")}`;
}
