import type { Command } from "commander";
import { loadConfig } from "../../config/loader";
import { initFormatters, getFormatter } from "../../formatters/registry";
import { Orchestrator } from "../../core/orchestrator";
import { initProviders, getProvider } from "../../providers/registry";
import { initAgents, listAgentConfigs } from "../../agents/registry";
import { runCouncil } from "../../core/council";
import { executeTool } from "../../tools/registry";
import { initTools } from "../../tools/registry";
import { startSpinner, succeedSpinner, failSpinner } from "../ui/spinner";

export function registerCouncilCommand(program: Command): void {
  program
    .command("council")
    .description("Run a council review (multi-agent deliberation)")
    .option("--members <agents>", "Comma-separated agent IDs for council", parseComma)
    .option("--chair-model <model>", "Model for chair synthesis")
    .option("-l, --level <level>", "Review level", "standard")
    .option("--format <format>", "Output format", "pretty")
    .option("-d, --diff <diff>", "Git diff string")
    .option("--diff-args <args>", "Git diff arguments", parseArgs)
    .option("-o, --output <file>", "Write output to file")
    .action(async (opts) => {
      const config = loadConfig();
      initFormatters();
      initProviders(config);
      initTools();
      initAgents(config.agentsDir);

      const provider = getProvider(config.defaultProvider);
      const chairModel = opts.chairModel ?? config.councilMode.chairModel;

      const memberIds: string[] = opts.members ??
        config.councilMode.defaultMembers;

      const allConfigs = listAgentConfigs();
      const memberConfigs = allConfigs.filter((c) => memberIds.includes(c.id));

      if (memberConfigs.length === 0) {
        console.error("No valid agent IDs found for council.");
        process.exit(1);
      }

      // Resolve diff
      let diff = opts.diff ?? "";
      if (!diff) {
        startSpinner("Gathering git diff...");
        const result = await executeTool("git-diff", {
          args: opts.diffArgs ?? ["HEAD~1", "HEAD"],
        });
        if (result.success) {
          diff = (result.data as { diff: string }).diff;
        }
      }

      startSpinner(`Council mode: ${memberConfigs.map((c) => c.name).join(", ")} + chair`);

      try {
        const councilResult = await runCouncil({
          memberConfigs,
          chairModel,
          provider,
          agentInput: {
            reviewId: "council",
            level: opts.level,
            context: { diff },
          },
        });

        succeedSpinner(
          `Council complete · ${councilResult.consensus.length} consensus findings · ${councilResult.durationMs}ms`,
        );

        // Build a fake ReviewSession to reuse formatters
        const fakeSession = {
          id: councilResult.id,
          createdAt: new Date().toISOString(),
          status: "complete" as const,
          request: { level: opts.level, format: opts.format },
          contextHash: "",
          agentResults: councilResult.stages[0]?.outputs ?? [],
          findings: councilResult.consensus.map((c, i) => ({
            id: String(i),
            agentId: "council",
            severity: c.averageSeverity as "critical" | "high" | "medium" | "low" | "info",
            category: "consensus",
            title: c.title,
            description: c.description,
            suggestion: "",
            confidence: c.agreementScore,
          })),
          councilResult,
          summary: councilResult.finalSynthesis.slice(0, 200),
          totalTokensUsed: councilResult.totalTokensUsed,
          durationMs: councilResult.durationMs,
        };

        const formatter = getFormatter(opts.format ?? "pretty");
        const output = formatter.format(fakeSession);

        if (opts.output) {
          require("fs").writeFileSync(opts.output, output);
          console.log(`Output written to ${opts.output}`);
        } else {
          process.stdout.write(output + "\n");
        }
      } catch (err) {
        failSpinner(`Council failed: ${err}`);
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
