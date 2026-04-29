import type { IFormatter } from "./base";
import type { ReviewSession } from "../types/review";
import type { Finding } from "../types/agent";

// Minimal chalk-like color helper that degrades gracefully without chalk
type ColorFn = (s: string) => string;
interface Colors {
  bold: ColorFn;
  green: ColorFn;
  red: ColorFn;
  yellow: ColorFn;
  blue: ColorFn;
  cyan: ColorFn;
  gray: ColorFn;
  reset: ColorFn;
}

function loadColors(): Colors {
  try {
    // chalk v5 is ESM-only; require() returns { default: instance } in CJS context
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const imported = require("chalk");
    const c = imported.default ?? imported;
    return {
      bold:   (s: string) => c.bold(s),
      green:  (s: string) => c.green(s),
      red:    (s: string) => c.red(s),
      yellow: (s: string) => c.yellow(s),
      blue:   (s: string) => c.blue(s),
      cyan:   (s: string) => c.cyan(s),
      gray:   (s: string) => c.gray(s),
      reset:  (s: string) => s,
    };
  } catch {
    const id: ColorFn = (s) => s;
    return { bold: id, green: id, red: id, yellow: id, blue: id, cyan: id, gray: id, reset: id };
  }
}

export const prettyFormatter: IFormatter = {
  name: "pretty",
  mimeType: "text/plain",
  fileExtension: ".txt",

  format(session: ReviewSession): string {
    const c = loadColors();
    const lines: string[] = [];

    lines.push(c.cyan("\n╔══════════════════════════════════════════════╗"));
    lines.push(c.cyan("║         Code Review Harness Report           ║"));
    lines.push(c.cyan("╚══════════════════════════════════════════════╝\n"));

    lines.push(
      `${c.bold("Level:")} ${session.request.level}  ` +
      `${c.bold("Duration:")} ${session.durationMs}ms  ` +
      `${c.bold("Tokens:")} ${session.totalTokensUsed}`,
    );
    lines.push(`${c.bold("Agents:")} ${session.agentResults.map((r) => r.agentName).join(", ")}`);

    if (session.routerDecision) {
      lines.push(c.gray(`Router: ${session.routerDecision.rationale}`));
    }

    lines.push("");

    if (session.findings.length === 0) {
      lines.push(c.green("✔ No issues found.\n"));
      return lines.join("\n");
    }

    lines.push(c.bold(`\nFindings: ${session.findings.length} total\n`));
    lines.push(c.bold("─".repeat(60)));

    const bySeverity: Record<string, Finding[]> = {};
    for (const f of session.findings) {
      if (!bySeverity[f.severity]) bySeverity[f.severity] = [];
      bySeverity[f.severity]!.push(f);
    }

    for (const severity of ["critical", "high", "medium", "low", "info"]) {
      const items = bySeverity[severity];
      if (!items?.length) continue;

      const severityLabel = `${severityIcon(severity)} ${severity.toUpperCase()} (${items.length})`;
      lines.push("\n" + colorBySeverity(c, severity)(severityLabel));

      for (const f of items) {
        const loc = f.filePath
          ? c.gray(` @ ${f.filePath}${f.lineStart ? `:${f.lineStart}` : ""}`)
          : "";
        lines.push(`  ● ${c.bold(f.title)}${loc}`);
        lines.push(`    ${c.gray(f.category)}${f.skillId ? c.gray(` [${f.skillId}]`) : ""}`);
        lines.push(`    ${f.description}`);
        lines.push(`    ${c.cyan("→")} ${f.suggestion}`);
        lines.push("");
      }
    }

    lines.push(c.bold("─".repeat(60)));
    lines.push(c.gray(`\nSession: ${session.id}`));
    return lines.join("\n");
  },
};

function colorBySeverity(c: Colors, severity: string): ColorFn {
  switch (severity) {
    case "critical":
    case "high": return c.red;
    case "medium": return c.yellow;
    case "low": return c.blue;
    default: return c.gray;
  }
}

function severityIcon(severity: string): string {
  switch (severity) {
    case "critical": return "🔴";
    case "high": return "🟠";
    case "medium": return "🟡";
    case "low": return "🔵";
    default: return "⚪";
  }
}

// These are used by other formatters that import from pretty.ts — keep them here
export function bold(c: Colors, s: string): string { return c.bold(s); }
export function gray(c: Colors, s: string): string { return c.gray(s); }
export function green(c: Colors, s: string): string { return c.green(s); }
