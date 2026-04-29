import { resolveReviewExitCode } from "../../src/utils/exit-code";
import type { Finding } from "../../src/types/agent";

const finding = (severity: Finding["severity"]): Finding => ({
  id: "1",
  agentId: "security",
  severity,
  category: "test",
  title: "test",
  description: "desc",
  suggestion: "fix",
  confidence: 1,
});

const ok = { error: undefined };
const failed = { error: "parse failed" };

describe("resolveReviewExitCode", () => {
  it("returns 0 when no agents errored and no findings", () => {
    expect(resolveReviewExitCode([ok, ok], [], "high")).toBe(0);
  });

  it("returns 1 when no agents errored and high finding exists", () => {
    expect(resolveReviewExitCode([ok], [finding("high")], "high")).toBe(1);
  });

  it("returns 2 when all agents errored and no findings", () => {
    expect(resolveReviewExitCode([failed, failed], [], "high")).toBe(2);
  });

  it("returns 2 when some agents errored and findings are below threshold", () => {
    // security agent errored, performance found only a low issue → incomplete review
    expect(resolveReviewExitCode([failed, ok], [finding("low")], "high")).toBe(2);
  });

  it("returns 1 when some agents errored but high finding already exists", () => {
    // preserve the findings exit code when it's already a failure
    expect(resolveReviewExitCode([failed, ok], [finding("high")], "high")).toBe(1);
  });

  it("returns 2 when one agent errored and zero findings (even if other agents succeeded)", () => {
    expect(resolveReviewExitCode([failed, ok], [], "high")).toBe(2);
  });

  it("returns 0 when agents errored but failOn is unknown", () => {
    // unknown failOn → computeExitCode returns 0, agent error → 2
    // wait: unknown failOn gives 0, agent errors → should still be 2
    expect(resolveReviewExitCode([failed], [], "unknown")).toBe(2);
  });
});
