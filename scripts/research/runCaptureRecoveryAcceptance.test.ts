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
  it("exits 0 and prints a machine-readable passing report for the default dual-scenario gate", async () => {
    const { io, stdout, stderr } = createCommandIo();

    const exitCode = await runCaptureRecoveryAcceptanceCommand([], io);

    expect(exitCode).toBe(0);
    const report = JSON.parse(stdout.join("")) as {
      passed: boolean;
      mode: string;
      scenarios: string[];
      reports: Array<{
        scenario: string;
        passed: boolean;
        failures: string[];
        checks: Array<{ id: string; passed: boolean }>;
        transcript: string[];
      }>;
    };
    expect(report.passed).toBe(true);
    expect(report.mode).toBe("default-gate");
    expect(report.scenarios).toEqual(["happy", "snapshot-as-response"]);
    expect(report.reports).toHaveLength(2);
    expect(report.reports.every((entry) => entry.passed)).toBe(true);
    expect(report.reports[0]?.checks.length).toBeGreaterThanOrEqual(15);
    expect(report.reports[1]?.transcript.join("\n")).toContain(
      "direct snapshot response; no standalone ok",
    );
    expect(stderr.join("")).toContain("snapshot-as-response");
  }, 30_000);

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

  it("rejects an unknown --scenario instead of silently running the happy path", async () => {
    const { io, stdout, stderr } = createCommandIo();

    const exitCode = await runCaptureRecoveryAcceptanceCommand(
      ["--scenario", "definitely-not-a-scenario"],
      io,
    );

    expect(exitCode).toBe(1);
    expect(stdout.join("")).toBe("");
    expect(stderr.join("")).toContain('Unknown --scenario "definitely-not-a-scenario"');
    expect(stderr.join("")).toContain("snapshot-as-response");
    expect(stderr.join("")).toContain("writer-no-drain");
  });
});
