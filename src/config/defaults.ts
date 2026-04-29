import { homedir } from "os";
import { join } from "path";
import type { CRHConfig } from "../types/config";

export const DEFAULT_CONFIG: CRHConfig = {
  version: 1,
  defaultProvider: "openrouter",
  defaultLevel: "standard",
  defaultFormat: "pretty",
  router: {
    model: "openai/gpt-4o-mini",
    enabled: true,
  },
  providers: {},
  agents: {
    security:      { id: "security",      enabled: true },
    performance:   { id: "performance",   enabled: true },
    architecture:  { id: "architecture",  enabled: true },
    correctness:   { id: "correctness",   enabled: true },
    testing:       { id: "testing",       enabled: true },
    style:         { id: "style",         enabled: false },
    documentation: { id: "documentation", enabled: false },
  },
  skills: {
    "owasp-top10":     { id: "owasp-top10",     enabled: true },
    "sql-injection":   { id: "sql-injection",   enabled: true },
    "big-o-analysis":  { id: "big-o-analysis",  enabled: true },
    "test-coverage":   { id: "test-coverage",   enabled: true },
    "api-design":      { id: "api-design",      enabled: false },
    "dependency-audit":{ id: "dependency-audit",enabled: true },
  },
  councilMode: {
    enabled: false,
    defaultAgent: "security",
    defaultModels: [
      "anthropic/claude-opus-4-5",
      "openai/gpt-4o",
      "google/gemini-2.5-pro-preview",
    ],
    chairModel: "anthropic/claude-opus-4-5",
    rounds: 1,
  },
  dbPath: join(homedir(), ".crh", "reviews.db"),
  skillsDir: join(homedir(), ".crh", "skills"),
  agentsDir: join(homedir(), ".crh", "agents"),
  logLevel: "info",
  telemetry: false,
};
