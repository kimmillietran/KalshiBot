import { describe, expect, it } from "vitest";
import { join } from "node:path";

import { runAuditCaptureCommand } from "./auditCapture";
import type { CommandIo, OperatorCommandRunner, RunTsxResult } from "./shared/commandRunner";

function createIo() {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const io: CommandIo = {
    writeStdout: (text) => {
      stdout.push(text);
    },
    writeStderr: (text) => {
      stderr.push(text);
    },
  };
  return { io, stdout, stderr };
}

function mockRunner(
  handler: (script: string, argv: readonly string[]) => RunTsxResult,
): OperatorCommandRunner {
  return {
    async runTsx(script, argv) {
      return handler(script, argv);
    },
  };
}

describe("runAuditCaptureCommand", () => {
  it("requires an explicit selector and prints selected run without substitution", async () => {
    const { io, stdout } = createIo();
    const selected = {
      outcome: "selected",
      runId: "selected-run",
      runDir: "data/live-capture/forward-quotes/selected-run",
      runState: "completed",
      warnings: [],
    };

    const exitCode = await runAuditCaptureCommand(["--latest"], {
      io,
      runner: mockRunner((script) => {
        if (script.includes("selectAuditableCaptureRun")) {
          return {
            exitCode: 0,
            stdout: JSON.stringify(selected) + "\n",
            stderr: "",
          };
        }
        return { exitCode: 0, stdout: "", stderr: "" };
      }),
    });

    expect(exitCode).toBe(0);
    const text = stdout.join("");
    expect(text).toContain("runId:    selected-run");
    expect(text).toContain("Done auditing capture run: selected-run");
    expect(text).not.toContain("substituted");
  });

  it("dry-run-plan documents selector without auditing live data", async () => {
    const { io, stdout } = createIo();
    const exitCode = await runAuditCaptureCommand(
      ["--run-id", "abc", "--full", "--dry-run-plan"],
      {
        io,
        runner: mockRunner(() => ({ exitCode: 0, stdout: "", stderr: "" })),
      },
    );
    expect(exitCode).toBe(0);
    expect(stdout.join("")).toContain("--run-id abc");
    expect(stdout.join("")).toContain("does not audit a live capture run");
  });

  it("joins --run-id against capture-root with path.join", async () => {
    const { io } = createIo();
    const selected = {
      outcome: "selected",
      runId: "win-run",
      runDir: "C:\\captures\\win-run",
      runState: "completed",
      warnings: [],
    };
    let selectorArgv: readonly string[] = [];
    const exitCode = await runAuditCaptureCommand(
      ["--run-id", "win-run", "--capture-root", "C:\\captures"],
      {
        io,
        runner: mockRunner((script, argv) => {
          if (script.includes("selectAuditableCaptureRun")) {
            selectorArgv = argv;
            return {
              exitCode: 0,
              stdout: JSON.stringify(selected) + "\n",
              stderr: "",
            };
          }
          return { exitCode: 0, stdout: "", stderr: "" };
        }),
      },
    );
    expect(exitCode).toBe(0);
    expect(selectorArgv).toEqual([
      "--capture-root",
      "C:\\captures",
      "--run-dir",
      join("C:\\captures", "win-run"),
    ]);
  });

  it("rejects missing selectors", async () => {
    const { io, stderr } = createIo();
    const exitCode = await runAuditCaptureCommand([], {
      io,
      runner: mockRunner(() => ({ exitCode: 0, stdout: "", stderr: "" })),
    });
    expect(exitCode).toBe(1);
    expect(stderr.join("")).toMatch(/Select a run/);
  });

  it("runs forward-capture-readiness before strategy-evaluation-readiness in --full", async () => {
    const { io, stdout } = createIo();
    const selected = {
      outcome: "selected",
      runId: "selected-run",
      runDir: "data/live-capture/forward-quotes/selected-run",
      runState: "completed",
      warnings: [],
    };
    const researchScripts: string[] = [];

    const exitCode = await runAuditCaptureCommand(["--run-id", "selected-run", "--full"], {
      io,
      runner: mockRunner((script) => {
        if (script.includes("selectAuditableCaptureRun")) {
          return {
            exitCode: 0,
            stdout: JSON.stringify(selected) + "\n",
            stderr: "",
          };
        }
        if (script.includes("scripts/research/")) {
          researchScripts.push(script);
        }
        return { exitCode: 0, stdout: "", stderr: "" };
      }),
    });

    expect(exitCode).toBe(0);
    const forwardIdx = researchScripts.findIndex((s) =>
      s.includes("buildForwardCaptureReadiness.ts"),
    );
    const strategyIdx = researchScripts.findIndex((s) =>
      s.includes("buildStrategyEvaluationReadiness.ts"),
    );
    const executableIdx = researchScripts.findIndex((s) =>
      s.includes("buildExecutableConfirmationDesign.ts"),
    );
    expect(forwardIdx).toBeGreaterThanOrEqual(0);
    expect(strategyIdx).toBeGreaterThanOrEqual(0);
    expect(forwardIdx).toBeLessThan(strategyIdx);
    expect(strategyIdx).toBeLessThan(executableIdx);
    expect(stdout.join("")).toContain("AGGREGATE-scoped");
  });

  it("same-pass full audit regenerates forward readiness before strategy consumes it", async () => {
    const { io } = createIo();
    const selected = {
      outcome: "selected",
      runId: "selected-run",
      runDir: "data/live-capture/forward-quotes/selected-run",
      runState: "completed",
      warnings: [],
    };

    // Stale prior-pass artifact: one calendar day.
    let forwardArtifact = JSON.stringify({
      generatedAt: "2026-07-01T00:00:00.000Z",
      aggregates: { daysCovered: 1, runCount: 1, totalDurationMinutes: 60 },
      summary: { overallVerdict: "not-ready-too-short" },
    });
    let strategyConsumedDays: number | null = null;

    const exitCode = await runAuditCaptureCommand(["--run-id", "selected-run", "--full"], {
      io,
      runner: mockRunner((script) => {
        if (script.includes("selectAuditableCaptureRun")) {
          return {
            exitCode: 0,
            stdout: JSON.stringify(selected) + "\n",
            stderr: "",
          };
        }
        if (script.includes("buildForwardCaptureReadiness.ts")) {
          // Same-pass regeneration: two calendar days (newly available runs).
          forwardArtifact = JSON.stringify({
            generatedAt: "2026-07-10T12:00:00.000Z",
            aggregates: { daysCovered: 2, runCount: 2, totalDurationMinutes: 480 },
            summary: { overallVerdict: "partially-ready" },
          });
          return { exitCode: 0, stdout: "", stderr: "" };
        }
        if (script.includes("buildStrategyEvaluationReadiness.ts")) {
          const parsed = JSON.parse(forwardArtifact) as {
            aggregates: { daysCovered: number };
          };
          strategyConsumedDays = parsed.aggregates.daysCovered;
          return { exitCode: 0, stdout: "", stderr: "" };
        }
        return { exitCode: 0, stdout: "", stderr: "" };
      }),
    });

    expect(exitCode).toBe(0);
    expect(strategyConsumedDays).toBe(2);
  });
});
