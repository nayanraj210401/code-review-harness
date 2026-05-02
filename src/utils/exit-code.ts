import type { Finding } from "../types/agent";

const SEVERITY_ORDER = ["info", "low", "medium", "high", "critical"] as const;

export function computeExitCode(findings: Finding[], failOn: string): number {
  const threshold = SEVERITY_ORDER.indexOf(failOn as typeof SEVERITY_ORDER[number]);
  if (threshold === -1) return 0;
  return findings.some((f) => SEVERITY_ORDER.indexOf(f.severity) >= threshold) ? 1 : 0;
}

// Returns 2 (incomplete review) when any agent errored and findings alone would
// have passed — preserves a real findings exit code (1) when one already exists.
export function resolveReviewExitCode(
  agentResults: Array<{ error?: string }>,
  findings: Finding[],
  failOn: string,
): number {
  const findingsCode = computeExitCode(findings, failOn);
  const hasAgentErrors = agentResults.some((r) => r.error);
  if (hasAgentErrors && findingsCode === 0) return 2;
  return findingsCode;
}
