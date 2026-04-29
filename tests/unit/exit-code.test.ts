import { computeExitCode } from "../../src/utils/exit-code";
import type { Finding } from "../../src/types/agent";

const finding = (severity: Finding["severity"]): Finding => ({
  id: "1",
  agentId: "security",
  severity,
  category: "test",
  title: "test finding",
  description: "desc",
  suggestion: "fix it",
  confidence: 1,
});

describe("computeExitCode", () => {
  it("returns 0 when no findings", () => {
    expect(computeExitCode([], "high")).toBe(0);
  });

  it("returns 0 when only low findings and failOn=high", () => {
    expect(computeExitCode([finding("low")], "high")).toBe(0);
  });

  it("returns 0 when only medium findings and failOn=high", () => {
    expect(computeExitCode([finding("medium")], "high")).toBe(0);
  });

  it("returns 1 when high finding and failOn=high", () => {
    expect(computeExitCode([finding("high")], "high")).toBe(1);
  });

  it("returns 1 when critical finding and failOn=high", () => {
    expect(computeExitCode([finding("critical")], "high")).toBe(1);
  });

  it("returns 0 when high finding but failOn=critical", () => {
    expect(computeExitCode([finding("high")], "critical")).toBe(0);
  });

  it("returns 1 when critical finding and failOn=critical", () => {
    expect(computeExitCode([finding("critical")], "critical")).toBe(1);
  });

  it("returns 1 when mixed findings include one at or above threshold", () => {
    expect(computeExitCode([finding("low"), finding("high")], "high")).toBe(1);
  });

  it("returns 0 for unknown failOn severity", () => {
    expect(computeExitCode([finding("critical")], "unknown")).toBe(0);
  });
});
