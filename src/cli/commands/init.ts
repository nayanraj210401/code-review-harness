import { execFile } from "child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "fs";
import { homedir } from "os";
import { join } from "path";
import { promisify } from "util";
import type { CRHConfig } from "../../types/config";
import { DEFAULT_CONFIG } from "../../config/defaults";

const execFileAsync = promisify(execFile);

const CRH_DIR = join(homedir(), ".crh");
const CONFIG_PATH = join(CRH_DIR, "config.json");
const AGENTS_DIR = join(CRH_DIR, "agents");
const SKILLS_DIR = join(CRH_DIR, "skills");

interface CliDetection {
  claudeFound: boolean;
  claudeVersion: string;
  codexFound: boolean;
  codexVersion: string;
  openrouterKeySet: boolean;
}

async function detectAvailableProviders(): Promise<CliDetection> {
  const [claude, codex] = await Promise.all([
    execFileAsync("claude", ["--version"]).then((r) => r.stdout.trim()).catch(() => ""),
    execFileAsync("codex", ["--version"]).then((r) => r.stdout.trim()).catch(() => ""),
  ]);
  return {
    claudeFound: claude.length > 0,
    claudeVersion: claude,
    codexFound: codex.length > 0,
    codexVersion: codex,
    openrouterKeySet: !!process.env.OPENROUTER_API_KEY,
  };
}

interface WizardAnswers {
  setupMode: "both-clis" | "claude-cli" | "codex-cli" | "openrouter" | "skip";
  apiKey?: string;
  defaultLevel: "quick" | "standard" | "deep";
  councilEnabled: boolean;
  enabledAgents: string[];
}

export async function runInit(options: {
  reset?: boolean;
  providerOnly?: boolean;
}): Promise<void> {
  const { default: inquirer } = await import("inquirer");
  const chalk = (await import("chalk")).default;

  console.log(
    chalk.cyan.bold(
      "\n┌─────────────────────────────────────────────────────┐\n│  Welcome to Code Review Harness (crh)               │\n│  Let's get you set up in under a minute.            │\n└─────────────────────────────────────────────────────┘\n",
    ),
  );

  if (existsSync(CONFIG_PATH) && !options.reset && !options.providerOnly) {
    console.log(chalk.yellow(`Config already exists at ${CONFIG_PATH}`));
    const { overwrite } = await inquirer.prompt([
      {
        type: "confirm",
        name: "overwrite",
        message: "Re-run setup? (existing config will be backed up)",
        default: false,
      },
    ]);
    if (!overwrite) {
      console.log("Setup cancelled. Use --reset to force.");
      return;
    }
    writeFileSync(CONFIG_PATH + ".bak", readFileSync(CONFIG_PATH));
    console.log(chalk.gray(`Backed up to ${CONFIG_PATH}.bak`));
  }

  // Auto-detect what's available
  process.stdout.write("Detecting available tools...\n");
  const detected = await detectAvailableProviders();

  if (detected.claudeFound) {
    console.log(chalk.green(`  ✔ claude CLI  ${detected.claudeVersion}`));
  } else {
    console.log(chalk.gray("  ✗ claude CLI  not found"));
  }
  if (detected.codexFound) {
    console.log(chalk.green(`  ✔ codex CLI   ${detected.codexVersion}`));
  } else {
    console.log(chalk.gray("  ✗ codex CLI   not found"));
  }
  if (detected.openrouterKeySet) {
    console.log(chalk.green("  ✔ OPENROUTER_API_KEY set"));
  } else {
    console.log(chalk.gray("  ✗ OPENROUTER_API_KEY not set"));
  }
  console.log();

  if (detected.claudeFound && detected.codexFound) {
    console.log(
      chalk.cyan(
        "  Both CLIs detected — you can run multi-model council reviews with zero API keys!\n",
      ),
    );
  }

  const answers = await askQuestions(inquirer, detected, options.providerOnly ?? false);
  const config = buildConfig(answers, detected);

  for (const dir of [CRH_DIR, AGENTS_DIR, SKILLS_DIR]) {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  }

  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), "utf8");
  console.log(chalk.green(`\n✔ Config written to ${CONFIG_PATH}`));

  try {
    const { getDb } = await import("../../state/db");
    getDb(config.dbPath);
    console.log(chalk.green(`✔ Database initialized at ${config.dbPath}`));
  } catch (err) {
    console.log(chalk.yellow(`⚠ Could not initialize database: ${err}`));
  }

  console.log(chalk.green(`✔ Directories ready`));

  if (answers.setupMode === "both-clis") {
    console.log(
      chalk.cyan(
        "\n  Council mode ready! Try:\n" +
        `  crh council --agent security --models claude-cli/claude-opus-4-5,codex-cli/gpt-4o\n`,
      ),
    );
  }

  if (!options.providerOnly) {
    const { runTest } = await inquirer.prompt([
      {
        type: "confirm",
        name: "runTest",
        message: "Run a quick test review on the last commit?",
        default: false,
      },
    ]);
    if (runTest) {
      console.log(chalk.gray("\nRunning quick review...\n"));
      try {
        const { Orchestrator } = await import("../../core/orchestrator");
        const { initFormatters, getFormatter } = await import("../../formatters/registry");
        initFormatters();
        const orch = new Orchestrator(config);
        const session = await orch.review({
          level: "quick",
          format: "pretty",
          diffArgs: ["HEAD~1", "HEAD"],
        });
        const output = getFormatter("pretty").format(session);
        process.stdout.write(output + "\n");
      } catch (err) {
        console.log(chalk.yellow(`Test review skipped: ${err}`));
      }
    }
  }

  console.log(chalk.cyan.bold("\nSetup complete! Try: crh review --help\n"));
}

async function askQuestions(
  inquirer: typeof import("inquirer").default,
  detected: CliDetection,
  providerOnly: boolean,
): Promise<WizardAnswers> {
  const chalk = (await import("chalk")).default;

  // Build provider choices based on what's available
  const choices: Array<{ name: string; value: string }> = [];

  if (detected.claudeFound && detected.codexFound) {
    choices.push({
      name: chalk.green("Both CLIs (recommended — zero API key, multi-model council ready)"),
      value: "both-clis",
    });
  }
  if (detected.claudeFound) {
    choices.push({
      name: `Claude CLI  (${detected.claudeVersion || "installed"}) — no API key needed`,
      value: "claude-cli",
    });
  }
  if (detected.codexFound) {
    choices.push({
      name: `Codex CLI   (${detected.codexVersion || "installed"}) — no API key needed`,
      value: "codex-cli",
    });
  }
  choices.push({
    name: detected.openrouterKeySet
      ? chalk.green("OpenRouter  (API key found in env — access to all models)")
      : "OpenRouter  (API key required — access to all models including Gemini)",
    value: "openrouter",
  });
  choices.push({ name: "Skip — I'll configure manually", value: "skip" });

  const { setupMode } = await inquirer.prompt([
    {
      type: "list",
      name: "setupMode",
      message: "How would you like to connect to AI?",
      choices,
    },
  ]);

  let apiKey: string | undefined;

  if (setupMode === "openrouter" && !detected.openrouterKeySet) {
    const { key } = await inquirer.prompt([
      {
        type: "password",
        name: "key",
        message: "Enter your OpenRouter API key:",
        mask: "*",
      },
    ]);
    apiKey = key;
  }

  if (providerOnly) {
    return {
      setupMode,
      apiKey,
      defaultLevel: "standard",
      councilEnabled: setupMode === "both-clis",
      enabledAgents: Object.keys(DEFAULT_CONFIG.agents).filter(
        (id) => DEFAULT_CONFIG.agents[id]?.enabled,
      ),
    };
  }

  const { defaultLevel } = await inquirer.prompt([
    {
      type: "list",
      name: "defaultLevel",
      message: "Default review level:",
      choices: [
        { name: "standard  (router picks best agents, 30s–2min)", value: "standard" },
        { name: "quick     (router picks 2 agents, <30s)", value: "quick" },
        { name: "deep      (all relevant agents, 2–10min)", value: "deep" },
      ],
    },
  ]);

  const councilDefault = setupMode === "both-clis";
  const { councilEnabled } = await inquirer.prompt([
    {
      type: "confirm",
      name: "councilEnabled",
      message: councilDefault
        ? "Enable council mode by default? (multi-model deliberation — you have both CLIs)"
        : "Enable council mode by default?",
      default: councilDefault,
    },
  ]);

  const { enabledAgents } = await inquirer.prompt([
    {
      type: "checkbox",
      name: "enabledAgents",
      message: "Which built-in agents to enable?",
      choices: [
        { name: "Security Expert",      value: "security",      checked: true },
        { name: "Performance Expert",   value: "performance",   checked: true },
        { name: "Architecture Expert",  value: "architecture",  checked: true },
        { name: "Correctness Expert",   value: "correctness",   checked: true },
        { name: "Testing Expert",       value: "testing",       checked: true },
        { name: "Style Expert",         value: "style",         checked: false },
        { name: "Documentation Expert", value: "documentation", checked: false },
      ],
    },
  ]);

  return { setupMode, apiKey, defaultLevel, councilEnabled, enabledAgents };
}

function buildConfig(answers: WizardAnswers, detected: CliDetection): CRHConfig {
  const config: CRHConfig = JSON.parse(JSON.stringify(DEFAULT_CONFIG));

  config.defaultLevel = answers.defaultLevel;
  config.councilMode.enabled = answers.councilEnabled;

  // Start with an empty providers map — only register what the user actually chose
  config.providers = {};

  switch (answers.setupMode) {
    case "both-clis":
      config.defaultProvider = "claude-cli";
      config.providers["claude-cli"] = { id: "claude-cli", defaultModel: "claude-cli/claude-opus-4-5" };
      config.providers["codex-cli"] = { id: "codex-cli", defaultModel: "codex-cli/o4-mini" };
      config.router.model = "claude-cli/claude-haiku-4-5";
      config.councilMode.defaultAgent = "security";
      config.councilMode.defaultModels = ["claude-cli/claude-opus-4-5", "codex-cli/gpt-4o"];
      config.councilMode.chairModel = "claude-cli/claude-opus-4-5";
      break;

    case "claude-cli":
      config.defaultProvider = "claude-cli";
      config.providers["claude-cli"] = { id: "claude-cli", defaultModel: "claude-cli/claude-opus-4-5" };
      config.router.model = "claude-cli/claude-haiku-4-5";
      config.councilMode.defaultModels = ["claude-cli/claude-opus-4-5", "claude-cli/claude-sonnet-4-5"];
      config.councilMode.chairModel = "claude-cli/claude-opus-4-5";
      break;

    case "codex-cli":
      config.defaultProvider = "codex-cli";
      config.providers["codex-cli"] = { id: "codex-cli", defaultModel: "codex-cli/o4-mini" };
      config.router.model = "codex-cli/gpt-4.1-mini";
      config.councilMode.defaultModels = ["codex-cli/o4-mini", "codex-cli/gpt-4.1"];
      config.councilMode.chairModel = "codex-cli/o4-mini";
      break;

    case "openrouter":
    default:
      config.defaultProvider = "openrouter";
      config.providers.openrouter = {
        id: "openrouter",
        apiKey: answers.apiKey ?? "${OPENROUTER_API_KEY}",
        baseUrl: "https://openrouter.ai/api/v1",
        defaultModel: "anthropic/claude-opus-4-5",
      };
      break;
  }

  for (const agentId of Object.keys(config.agents)) {
    if (config.agents[agentId]) {
      config.agents[agentId]!.enabled = answers.enabledAgents.includes(agentId);
    }
  }

  return config;
}
