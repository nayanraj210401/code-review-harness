import { writeFileSync } from "fs";
import type { Command } from "commander";
import type { ReviewRequest } from "../../types/review";
import { loadConfig } from "../../config/loader";
import { initFormatters, getFormatter } from "../../formatters/registry";
import { Orchestrator } from "../../core/orchestrator";
import {
  startSpinner,
  updateSpinner,
  succeedSpinner,
  failSpinner,
} from "../ui/spinner";
import { logger } from "../../utils/logger";

export function registerReviewCommand(program: Command): void {
  program
    .command("review")
    .description("Run a code review")
    .option("-d, --diff <diff>", "Git diff string (or pipe via stdin)")
    .option(
      "--diff-args <args>",
      "Git diff arguments, e.g. HEAD~1 HEAD",
      parseArgs,
    )
    .option("-f, --files <files>", "Specific files to review (comma-separated)", parseComma)
    .option(
      "-l, --level <level>",
      "Review level: quick | standard | deep",
      "standard",
    )
    .option(
      "--format <format>",
      "Output format: pretty | json | markdown | sarif",
      "pretty",
    )
    .option("--agents <agents>", "Comma-separated agent IDs (bypass router)", parseComma)
    .option("--skills <skills>", "Comma-separated skill IDs to activate", parseComma)
    .option("-o, --output <file>", "Write output to file instead of stdout")
    .option("--no-cache", "Skip cache lookup")
    .option("--council", "Enable council mode")
    .option("--verbose", "Show router decisions and agent progress")
    .option(
      "--fail-on <severity>",
      "Exit code 1 if findings at this severity or above (critical|high|medium|low)",
      "high",
    )
    .action(async (opts) => {
      const config = loadConfig({
        defaultLevel: opts.level,
        defaultFormat: opts.format,
      });

      logger.setLevel(config.logLevel);
      initFormatters();

      const request: ReviewRequest = {
        diff: opts.diff ?? readStdinIfPiped(),
        diffArgs: opts.diffArgs,
        files: opts.files,
        level: opts.level ?? config.defaultLevel,
        format: opts.format ?? config.defaultFormat,
        agentIds: opts.agents,
        skillIds: opts.skills,
        outputFile: opts.output,
        noCache: opts.noCache === false,
        councilMode: opts.council ?? config.councilMode.enabled,
        verbose: opts.verbose,
      };

      const orch = new Orchestrator(config);

      // Wire up progress display
      orch.on("routing", () => startSpinner("🔀 Routing to relevant agents..."));
      orch.on("gathering-context", ({ routerDecision }) => {
        updateSpinner(
          `📂 Gathering context · Agents: ${routerDecision.selectedAgents.join(", ")}`,
        );
      });
      orch.on("running-agents", () => updateSpinner("🤖 Running agents in parallel..."));
      orch.on("agent-complete", ({ agentName, findingCount }) => {
        updateSpinner(`✓ ${agentName}: ${findingCount} findings`);
      });
      orch.on("cache-hit", () => {
        updateSpinner("⚡ Cache hit — using previous result");
      });

      try {
        const session = await orch.review(request);

        succeedSpinner(`Review complete · ${session.findings.length} findings in ${session.durationMs}ms`);

        const formatter = getFormatter(request.format);
        const output = formatter.format(session);

        if (request.outputFile) {
          writeFileSync(request.outputFile, output, "utf8");
          console.log(`\nOutput written to ${request.outputFile}`);
        } else {
          process.stdout.write(output + "\n");
        }

        const exitCode = computeExitCode(
          session.findings,
          opts.failOn ?? "high",
        );
        process.exit(exitCode);
      } catch (err) {
        failSpinner(`Review failed: ${err}`);
        logger.error(`Review failed: ${err}`);
        process.exit(2);
      }
    });
}

function parseArgs(value: string): string[] {
  return value.split(/\s+/).filter(Boolean);
}

function parseComma(value: string): string[] {
  return value.split(",").map((s) => s.trim()).filter(Boolean);
}

function readStdinIfPiped(): string | undefined {
  if (process.stdin.isTTY) return undefined;
  try {
    const { readFileSync } = require("fs");
    return readFileSync("/dev/stdin", "utf8");
  } catch {
    return undefined;
  }
}

function computeExitCode(
  findings: import("../../types/agent").Finding[],
  failOn: string,
): number {
  const severityOrder = ["info", "low", "medium", "high", "critical"];
  const threshold = severityOrder.indexOf(failOn);
  if (threshold === -1) return 0;

  const hasIssue = findings.some(
    (f) => severityOrder.indexOf(f.severity) >= threshold,
  );
  return hasIssue ? 1 : 0;
}
