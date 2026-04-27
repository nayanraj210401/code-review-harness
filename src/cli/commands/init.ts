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

interface WizardAnswers {
  provider: string;
  apiKey?: string;
  defaultModel: string;
  defaultLevel: "quick" | "standard" | "deep";
  councilEnabled: boolean;
  enabledAgents: string[];
}

export async function runInit(options: {
  reset?: boolean;
  providerOnly?: boolean;
}): Promise<void> {
  // Import inquirer dynamically (ESM)
  const { default: inquirer } = await import("inquirer");
  const chalk = (await import("chalk")).default;

  console.log(
    chalk.cyan.bold(
      "\n┌─────────────────────────────────────────────────────┐\n│  Welcome to Code Review Harness (crh)               │\n│  Let\'s get you set up in under a minute.            │\n└─────────────────────────────────────────────────────┘\n",
    ),
  );

  if (existsSync(CONFIG_PATH) && !options.reset && !options.providerOnly) {
    console.log(
      chalk.yellow(`Config already exists at ${CONFIG_PATH}`),
    );
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
    // Back up existing config
    const backup = CONFIG_PATH + ".bak";
    writeFileSync(backup, readFileSync(CONFIG_PATH));
    console.log(chalk.gray(`Backed up to ${backup}`));
  }

  const answers = await askQuestions(inquirer, options.providerOnly ?? false);
  const config = buildConfig(answers);

  // Create directories
  for (const dir of [CRH_DIR, AGENTS_DIR, SKILLS_DIR]) {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  }

  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), "utf8");
  console.log(chalk.green(`\n✔ Config written to ${CONFIG_PATH}`));

  // Initialize DB
  try {
    const { getDb } = await import("../../state/db");
    getDb(config.dbPath);
    console.log(chalk.green(`✔ Database initialized at ${config.dbPath}`));
  } catch (err) {
    console.log(chalk.yellow(`⚠ Could not initialize database: ${err}`));
  }

  console.log(chalk.green(`✔ Directories ready: ${AGENTS_DIR}, ${SKILLS_DIR}`));

  // Optional test review
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
      console.log(chalk.gray("\nRunning: crh review --level quick --format pretty\n"));
      try {
        await execFileAsync("crh", ["review", "--level", "quick", "--format", "pretty"], {
          stdio: ["inherit", "inherit", "inherit"],
        } as Parameters<typeof execFileAsync>[2]);
      } catch {
        console.log(chalk.yellow("Test review skipped (run manually with: crh review --level quick)"));
      }
    }
  }

  console.log(chalk.cyan.bold("\nSetup complete! Try: crh review --help\n"));
}

async function askQuestions(
  inquirer: typeof import("inquirer").default,
  providerOnly: boolean,
): Promise<WizardAnswers> {
  const chalk = (await import("chalk")).default;

  // Provider selection
  const { provider } = await inquirer.prompt([
    {
      type: "list",
      name: "provider",
      message: "Which AI provider would you like to use?",
      choices: [
        { name: "OpenRouter (recommended — access to all models)", value: "openrouter" },
        { name: "Claude CLI  (use your existing `claude` login)", value: "claude-cli" },
        { name: "Codex CLI   (use your existing `codex` login)", value: "codex-cli" },
        { name: "Skip — I\'ll configure manually", value: "skip" },
      ],
    },
  ]);

  let apiKey: string | undefined;
  let defaultModel = "anthropic/claude-opus-4-5";

  if (provider === "openrouter") {
    const apiKeyEnv = process.env.OPENROUTER_API_KEY;
    if (apiKeyEnv) {
      console.log(chalk.green("  ✔ Found OPENROUTER_API_KEY in environment"));
    } else {
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

    const { model } = await inquirer.prompt([
      {
        type: "list",
        name: "model",
        message: "Which model should be the default?",
        choices: [
          { name: "anthropic/claude-opus-4-5   (best quality)", value: "anthropic/claude-opus-4-5" },
          { name: "openai/gpt-4o               (fast + good)", value: "openai/gpt-4o" },
          { name: "google/gemini-2.5-pro-preview", value: "google/gemini-2.5-pro-preview" },
          { name: "Enter custom model ID", value: "__custom__" },
        ],
      },
    ]);
    if (model === "__custom__") {
      const { customModel } = await inquirer.prompt([
        { type: "input", name: "customModel", message: "Model ID:" },
      ]);
      defaultModel = customModel;
    } else {
      defaultModel = model;
    }
  } else if (provider === "claude-cli") {
    process.stdout.write("  Checking `claude` CLI... ");
    try {
      const { stdout } = await execFileAsync("claude", ["--version"]);
      console.log(chalk.green(`found ${stdout.trim()}`));
    } catch {
      console.log(chalk.yellow("not found. Install Claude Code CLI first."));
    }
    defaultModel = "claude-cli/claude-opus-4-5";
  } else if (provider === "codex-cli") {
    process.stdout.write("  Checking `codex` CLI... ");
    try {
      const { stdout } = await execFileAsync("codex", ["--version"]);
      console.log(chalk.green(`found ${stdout.trim()}`));
    } catch {
      console.log(chalk.yellow("not found. Install Codex CLI first."));
    }
    defaultModel = "codex-cli/o4-mini";
  }

  if (providerOnly) {
    return {
      provider,
      apiKey,
      defaultModel,
      defaultLevel: "standard",
      councilEnabled: false,
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
        { name: "standard  (router picks best 5 agents, 30s–2min)", value: "standard" },
        { name: "quick     (router picks best 2 agents, <30s)", value: "quick" },
        { name: "deep      (all relevant agents, 2–10min)", value: "deep" },
      ],
    },
  ]);

  const { councilEnabled } = await inquirer.prompt([
    {
      type: "confirm",
      name: "councilEnabled",
      message: "Enable council mode by default? (agents deliberate and reach consensus)",
      default: false,
    },
  ]);

  const { enabledAgents } = await inquirer.prompt([
    {
      type: "checkbox",
      name: "enabledAgents",
      message: "Which built-in agents to enable? (space to toggle)",
      choices: [
        { name: "Security Expert", value: "security", checked: true },
        { name: "Performance Expert", value: "performance", checked: true },
        { name: "Architecture Expert", value: "architecture", checked: true },
        { name: "Correctness Expert", value: "correctness", checked: true },
        { name: "Testing Expert", value: "testing", checked: true },
        { name: "Style Expert", value: "style", checked: false },
        { name: "Documentation Expert", value: "documentation", checked: false },
      ],
    },
  ]);

  return { provider, apiKey, defaultModel, defaultLevel, councilEnabled, enabledAgents };
}

function buildConfig(answers: WizardAnswers): CRHConfig {
  const config: CRHConfig = JSON.parse(JSON.stringify(DEFAULT_CONFIG));

  config.defaultProvider = answers.provider === "skip" ? "openrouter" : answers.provider;
  config.defaultLevel = answers.defaultLevel;
  config.councilMode.enabled = answers.councilEnabled;

  // Provider config
  if (answers.provider === "openrouter") {
    config.providers.openrouter = {
      id: "openrouter",
      apiKey: answers.apiKey ? answers.apiKey : "${OPENROUTER_API_KEY}",
      baseUrl: "https://openrouter.ai/api/v1",
      defaultModel: answers.defaultModel,
    };
  } else if (answers.provider === "claude-cli") {
    config.providers["claude-cli"] = {
      id: "claude-cli",
      defaultModel: answers.defaultModel,
    };
  } else if (answers.provider === "codex-cli") {
    config.providers["codex-cli"] = {
      id: "codex-cli",
      defaultModel: answers.defaultModel,
    };
  }

  // Agent toggles
  for (const agentId of Object.keys(config.agents)) {
    if (config.agents[agentId]) {
      config.agents[agentId]!.enabled = answers.enabledAgents.includes(agentId);
    }
  }

  return config;
}
