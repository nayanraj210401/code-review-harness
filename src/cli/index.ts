import { Command } from "commander";
import { existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { registerReviewCommand } from "./commands/review";
import { registerCouncilCommand } from "./commands/council";
import { registerServeCommand } from "./commands/serve";
import { registerAgentsCommand } from "./commands/agents";
import { registerSkillsCommand } from "./commands/skills";
import { registerHistoryCommand } from "./commands/history";
import { runInit } from "./commands/init";

// Auto-trigger init on first run
const CONFIG_PATH = join(homedir(), ".crh", "config.json");

async function main(): Promise<void> {
  const program = new Command();

  program
    .name("crh")
    .description("Code Review Harness — multi-agent AI code review CLI")
    .version("0.1.0")
    .option("--no-color", "Disable color output");

  // Auto-init only for commands that require a provider (review, council)
  const requiresProvider = ["review", "council"].some((cmd) => process.argv.includes(cmd));
  const skipInit = process.argv.some((a) => ["init", "--help", "-h", "--version", "-V"].includes(a));
  if (!existsSync(CONFIG_PATH) && requiresProvider && !skipInit) {
    console.log("No config found. Running first-time setup...\n");
    await runInit({});
  }

  registerReviewCommand(program);
  registerCouncilCommand(program);
  registerServeCommand(program);
  registerAgentsCommand(program);
  registerSkillsCommand(program);
  registerHistoryCommand(program);

  program
    .command("init")
    .description("First-time setup wizard")
    .option("--reset", "Re-run setup (backs up existing config)")
    .option("--provider", "Re-configure provider only")
    .action(async (opts) => {
      await runInit({ reset: opts.reset, providerOnly: opts.provider });
    });

  program
    .command("config")
    .description("Show current configuration")
    .action(() => {
      const { loadConfig, getConfigPath } = require("../config/loader");
      const config = loadConfig();
      console.log(`Config path: ${getConfigPath()}\n`);
      console.log(JSON.stringify(config, null, 2));
    });

  await program.parseAsync(process.argv);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(2);
});
