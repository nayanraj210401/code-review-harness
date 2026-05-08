import type { Command } from "commander";
import { execSync, spawnSync } from "child_process";
import chalk from "chalk";
import { startSpinner, succeedSpinner, failSpinner } from "../ui/spinner";

function getInstalledVersion(): string {
  // Read from the package.json that ships with this installation
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require("../../../package.json").version as string;
}

function getLatestVersion(): string {
  const result = spawnSync("npm", ["info", "review-harness", "version"], {
    encoding: "utf8",
    timeout: 10000,
  });
  if (result.error || result.status !== 0) {
    throw new Error("Could not reach npm registry. Check your internet connection.");
  }
  return result.stdout.trim();
}

function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] ?? 0) > (pb[i] ?? 0)) return 1;
    if ((pa[i] ?? 0) < (pb[i] ?? 0)) return -1;
  }
  return 0;
}

export function registerUpdateCommand(program: Command): void {
  program
    .command("update")
    .description("Update crh to the latest version")
    .option("--check", "Only check for updates, do not install")
    .action(async (opts: { check?: boolean }) => {
      const current = getInstalledVersion();
      console.log(`\n  Current version: ${chalk.dim(`v${current}`)}`);

      startSpinner("Checking npm registry for latest version…");
      let latest: string;
      try {
        latest = getLatestVersion();
        succeedSpinner(`Latest version: ${chalk.green(`v${latest}`)}`);
      } catch (err) {
        failSpinner((err as Error).message);
        process.exit(1);
      }

      const cmp = compareVersions(latest, current);

      if (cmp === 0) {
        console.log(`\n  ${chalk.green("✓")} Already up to date.\n`);
        return;
      }

      if (cmp < 0) {
        console.log(`\n  ${chalk.yellow("!")} You are running a newer version than what is published (${chalk.dim(`v${current}`)} > ${chalk.dim(`v${latest}`)}).\n`);
        return;
      }

      // cmp > 0 — update available
      console.log(`\n  ${chalk.cyan("↑")} Update available: ${chalk.dim(`v${current}`)} → ${chalk.green(`v${latest}`)}`);

      if (opts.check) {
        console.log(`\n  Run ${chalk.cyan("crh update")} to install.\n`);
        return;
      }

      console.log();
      startSpinner(`Installing review-harness@${latest}…`);
      try {
        execSync(`npm install -g review-harness@${latest}`, { stdio: "ignore" });
        succeedSpinner(`Updated to ${chalk.green(`v${latest}`)} — restart your shell if the version doesn't reflect immediately.`);
        console.log();
      } catch {
        failSpinner("Update failed. Try manually: " + chalk.cyan(`npm install -g review-harness@${latest}`));
        process.exit(1);
      }
    });
}
