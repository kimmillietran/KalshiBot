import { describe, expect, it } from "vitest";

import { runWsReconnectAcceptanceCommand } from "./runWsReconnectAcceptance";

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

describe("runWsReconnectAcceptanceCommand", () => {
  it("exits 0 and prints a machine-readable passing report for the default dual-scenario gate", async () => {
    const { io, stdout, stderr } = createCommandIo();

    const exitCode = await runWsReconnectAcceptanceCommand([], io);

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
        observed: {
          processSafety: {
            uncaughtExceptionCount: number;
            unhandledRejectionCount: number;
          };
        };
      }>;
    };
    expect(report.passed).toBe(true);
    expect(report.mode).toBe("default-gate");
    expect(report.scenarios).toEqual([
      "reconnect-success",
      "reconnect-401-terminal",
    ]);
    expect(report.reports).toHaveLength(2);
    expect(report.reports.every((entry) => entry.passed)).toBe(true);
    expect(
      report.reports.every(
        (entry) =>
          entry.observed.processSafety.uncaughtExceptionCount === 0
          && entry.observed.processSafety.unhandledRejectionCount === 0,
      ),
    ).toBe(true);
    expect(stderr.join("")).toContain("reconnect-401-terminal");
  }, 90_000);

  it("rejects an unknown --scenario instead of silently running the happy path", async () => {
    const { io, stdout, stderr } = createCommandIo();

    const exitCode = await runWsReconnectAcceptanceCommand(
      ["--scenario", "definitely-not-a-scenario"],
      io,
    );

    expect(exitCode).toBe(1);
    expect(stdout.join("")).toBe("");
    expect(stderr.join("")).toContain('Unknown --scenario "definitely-not-a-scenario"');
    expect(stderr.join("")).toContain("reconnect-success");
    expect(stderr.join("")).toContain("second-attempt-success");
  });
});
