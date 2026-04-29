import type { Finding } from "../types/agent";

const SEVERITY_ORDER = ["info", "low", "medium", "high", "critical"] as const;

export function computeExitCode(findings: Finding[], failOn: string): number {
  const threshold = SEVERITY_ORDER.indexOf(failOn as typeof SEVERITY_ORDER[number]);
  if (threshold === -1) return 0;
  return findings.some((f) => SEVERITY_ORDER.indexOf(f.severity) >= threshold) ? 1 : 0;
}
