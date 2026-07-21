import { describe, expect, it } from "vitest";

import { runCaptureRecoveryAcceptanceCommand } from "./runCaptureRecoveryAcceptance";

function createCommandIo() {
  const stdout: string[] = [];
  const stderr: string[] = [];
  return {
    stdout,
    stderr,
    io: {
      writeStdout: (text: string) => {
        stdout.push(text);
      },
      writeStderr: (text: string) => {
        stderr.push(text);
      },
    },
  };
}

describe("runCaptureRecoveryAcceptanceCommand", () => {
  it("exits 0 and prints a machine-readable passing report for the happy scenario", async () => {
    const { io, stdout } = createCommandIo();

    const exitCode = await runCaptureRecoveryAcceptanceCommand([], io);

    expect(exitCode).toBe(0);
    const report = JSON.parse(stdout.join("")) as {
      passed: boolean;
      scenario: string;
      failures: string[];
      checks: Array<{ id: string; passed: boolean }>;
      transcript: string[];
    };
    expect(report.passed).toBe(true);
    expect(report.scenario).toBe("happy");
    expect(report.failures).toEqual([]);
    expect(report.checks.length).toBeGreaterThanOrEqual(15);
    expect(report.transcript.length).toBeGreaterThan(5);
  }, 20_000);

  it("exits nonzero when an acceptance requirement fails", async () => {
    const { io, stdout, stderr } = createCommandIo();

    const exitCode = await runCaptureRecoveryAcceptanceCommand(
      ["--scenario", "no-fresh-snapshot"],
      io,
    );

    expect(exitCode).toBe(1);
    const report = JSON.parse(stdout.join("")) as { passed: boolean };
    expect(report.passed).toBe(false);
    expect(stderr.join("")).toContain("Capture recovery acceptance FAILED");
  }, 20_000);
});
