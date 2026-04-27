import { existsSync, readFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import type { CRHConfig } from "../types/config";
import { DEFAULT_CONFIG } from "./defaults";
import { CRHConfigSchema } from "./schema";

const CONFIG_PATH = join(homedir(), ".crh", "config.json");

function expandEnvVars(obj: unknown): unknown {
  if (typeof obj === "string") {
    return obj.replace(/\$\{([^}]+)\}/g, (_, name) => process.env[name] ?? "");
  }
  if (Array.isArray(obj)) return obj.map(expandEnvVars);
  if (obj !== null && typeof obj === "object") {
    return Object.fromEntries(
      Object.entries(obj as Record<string, unknown>).map(([k, v]) => [
        k,
        expandEnvVars(v),
      ]),
    );
  }
  return obj;
}

function deepMerge<T>(base: T, override: Partial<T>): T {
  const result = { ...base };
  for (const key in override) {
    const val = override[key];
    if (
      val !== null &&
      typeof val === "object" &&
      !Array.isArray(val) &&
      typeof result[key] === "object" &&
      result[key] !== null
    ) {
      result[key] = deepMerge(result[key] as object, val as object) as T[typeof key];
    } else if (val !== undefined) {
      result[key] = val as T[typeof key];
    }
  }
  return result;
}

export function loadConfig(cliOverrides: Partial<CRHConfig> = {}): CRHConfig {
  let fileConfig: Partial<CRHConfig> = {};

  if (existsSync(CONFIG_PATH)) {
    try {
      const raw = readFileSync(CONFIG_PATH, "utf8");
      fileConfig = expandEnvVars(JSON.parse(raw)) as Partial<CRHConfig>;
    } catch (err) {
      process.stderr.write(`[warn] Failed to parse ~/.crh/config.json: ${err}\n`);
    }
  }

  // Apply env var shortcuts
  const envOverrides: Partial<CRHConfig> = {};
  if (process.env.CRH_DEFAULT_LEVEL) {
    envOverrides.defaultLevel = process.env.CRH_DEFAULT_LEVEL as CRHConfig["defaultLevel"];
  }
  if (process.env.CRH_DEFAULT_PROVIDER) {
    envOverrides.defaultProvider = process.env.CRH_DEFAULT_PROVIDER;
  }
  if (process.env.CRH_LOG_LEVEL) {
    envOverrides.logLevel = process.env.CRH_LOG_LEVEL as CRHConfig["logLevel"];
  }

  const merged = deepMerge(deepMerge(DEFAULT_CONFIG, fileConfig), {
    ...envOverrides,
    ...cliOverrides,
  });

  const result = CRHConfigSchema.safeParse(merged);
  if (!result.success) {
    throw new Error(
      `Invalid configuration:\n${result.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n")}`,
    );
  }

  return result.data as CRHConfig;
}

export function getConfigPath(): string {
  return CONFIG_PATH;
}
