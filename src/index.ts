export * from "./types";
export { Orchestrator } from "./core/orchestrator";
export { loadConfig } from "./config/loader";
export { DEFAULT_CONFIG } from "./config/defaults";

export function createReviewHarness(configOverrides: Partial<import("./types").CRHConfig> = {}) {
  const { loadConfig } = require("./config/loader");
  const { Orchestrator } = require("./core/orchestrator");
  const config = loadConfig(configOverrides);
  return new Orchestrator(config);
}
