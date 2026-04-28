import type { Command } from "commander";
import { loadConfig } from "../../config/loader";
import { initFormatters, getFormatter } from "../../formatters/registry";
import { initProviders, getProvider } from "../../providers/registry";
import { initAgents, getAgentConfig } from "../../agents/registry";
import { initSkills, getSkillManifests } from "../../skills/registry";
import { loadSkillContent } from "../../skills/loader";
import { runCouncil } from "../../core/council";
import { executeTool } from "../../tools/registry";
import { initTools } from "../../tools/registry";
import { startSpinner, succeedSpinner, failSpinner, updateSpinner } from "../ui/spinner";

export function registerCouncilCommand(program: Command): void {
  program
    .command("council")
    .description("Run a council review — same agent role, multiple model families deliberate")
    .option(
      "--agent <id>",
      "Agent role all council members share (e.g. security)",
    )
    .option(
      "--models <models>",
      "Comma-separated model IDs — one member per model (min 2)",
      parseComma,
    )
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
      initAgents(config.agentsDir, process.cwd() + "/.crh/agents");
      initSkills(config.skillsDir);

      const provider = getProvider(config.defaultProvider);
      const chairModel = opts.chairModel ?? config.councilMode.chairModel;

      // Resolve agent role
      const agentId: string = opts.agent ?? config.councilMode.defaultAgent;
      const baseConfig = getAgentConfig(agentId);
      if (!baseConfig) {
        console.error(
          `Agent "${agentId}" not found. Run \`crh agents list\` to see available agents.`,
        );
        process.exit(1);
      }

      // Resolve models
      const models: string[] = opts.models ?? config.councilMode.defaultModels;
      if (models.length < 2) {
        console.error("Council mode requires at least 2 models. Use --models claude-opus-4-5,gpt-4o");
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

      const modelLabels = models.map((m) => m.includes("/") ? m.split("/").pop()! : m);
      startSpinner(
        `Council: ${baseConfig.name} × [${modelLabels.join(", ")}] + chair`,
      );

      const skillCatalog = getSkillManifests();
      const skillLoader = (id: string) => loadSkillContent(id);

      // Merge router hints (none in council — agent decides on its own)
      const suggestedSkillIds = [...baseConfig.builtinSkills];

      try {
        const councilResult = await runCouncil({
          baseConfig,
          models,
          chairModel,
          provider,
          agentInput: {
            reviewId: "council",
            level: opts.level,
            context: { diff },
            skillCatalog,
            suggestedSkillIds,
            skillLoader,
          },
        });

        succeedSpinner(
          `Council complete · ${councilResult.consensus.length} consensus findings · ${councilResult.durationMs}ms`,
        );

        // Reuse formatters via a ReviewSession-shaped object
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
            suggestion: `Agreement: ${Math.round(c.agreementScore * 100)}% of models`,
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
