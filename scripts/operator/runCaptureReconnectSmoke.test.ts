import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import type { ReconnectSmokeAcceptanceSummary } from "../research/reconnectSmokeAcceptance/reconnectSmokeAcceptanceTypes";
import { runCaptureReconnectSmokeCommand } from "./runCaptureReconnectSmoke";
import type { CommandIo, OperatorCommandRunner, RunTsxResult } from "./shared/commandRunner";
import {
  issueReconnectSmokeAuthorization,
  readReconnectSmokeAuthorizationSummary,
  reconnectSmokeAuthorizationPath,
  writeReconnectSmokeAuthorizationSummary,
  buildReconnectSmokeAuthorizationSummary,
} from "./shared/reconnectSmokeAuthorization";

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

function lifecycleForControlled(runId: string, cycleId = 1): string {
  return [
    JSON.stringify({
      runId,
      type: "controlledReconnectRequested",
      detectedAt: "2026-07-22T00:00:10.000Z",
      recoveryCycleId: cycleId,
      recoveryReason: "controlled-reconnect-validation",
      requestDisposition: "started",
      socketGeneration: 1,
    }),
    JSON.stringify({
      runId,
      type: "wsRecoveryAttempted",
      detectedAt: "2026-07-22T00:00:11.000Z",
      recoveryCycleId: cycleId,
      recoveryReason: "controlled-reconnect-validation",
      reason: "controlled-reconnect-validation",
      attemptNumber: 1,
      socketGeneration: 2,
    }),
    JSON.stringify({
      runId,
      type: "wsRecoverySucceeded",
      detectedAt: "2026-07-22T00:00:12.000Z",
      recoveryCycleId: cycleId,
      recoveryReason: "controlled-reconnect-validation",
      attemptNumber: 1,
      socketGeneration: 2,
    }),
  ].join("\n");
}

function writeExactRunArtifacts(runDir: string, runId: string): void {
  mkdirSync(runDir, { recursive: true });
  writeFileSync(
    join(runDir, "capture-run-status.json"),
    JSON.stringify({
      schemaVersion: 1,
      runId,
      state: "completed",
      startedAt: "2026-07-22T00:00:00.000Z",
      endedAt: "2026-07-22T00:20:00.000Z",
      captureEndReason: "duration-complete",
      failureReason: null,
    }),
    "utf8",
  );
  writeFileSync(
    join(runDir, "capture-health.json"),
    JSON.stringify({
      runId,
      verdict: "capture-mvp-success",
      errors: [],
      connection: {
        completedNormally: true,
        liveConnectionSucceeded: true,
        captureEndReason: "duration-complete",
        terminalFailureReason: null,
        reconnectCount: 1,
        connectionAttemptCount: 2,
        authHeaderGenerationCount: 2,
      },
      watchdog: {
        wsRecoverySuccessCount: 1,
        wsRecoveryFailureCount: 0,
        terminalWebSocketFailure: false,
      },
      writer: {
        allStreamsDrained: true,
        failure: null,
      },
    }),
    "utf8",
  );
  writeFileSync(
    join(runDir, "capture-health-audit.json"),
    JSON.stringify({
      selectedRunId: runId,
      summary: { verdict: "capture-research-ready" },
    }),
    "utf8",
  );
  writeFileSync(
    join(runDir, "capture-lifecycle.jsonl"),
    `${lifecycleForControlled(runId)}\n`,
    "utf8",
  );
}

function passingAcceptance(
  runId: string,
  runDir: string,
  overrides: Partial<ReconnectSmokeAcceptanceSummary> = {},
): ReconnectSmokeAcceptanceSummary {
  return {
    schemaVersion: 1,
    mode: "reconnect-smoke",
    runId,
    runDir,
    durationMinutes: 20,
    captureExitCode: 0,
    auditExitCode: 0,
    auditVerdict: "capture-research-ready",
    auditSelectedRunId: runId,
    nativeVerdict: "capture-mvp-success",
    nativeErrorCount: 0,
    runStatusState: "completed",
    captureEndReason: "duration-complete",
    completedNormally: true,
    liveConnectionSucceeded: true,
    reconnectCount: 1,
    connectionAttemptCount: 2,
    authHeaderGenerationCount: 2,
    wsRecoverySuccessCount: 1,
    wsRecoveryFailureCount: 0,
    terminalWebSocketFailure: false,
    allStreamsDrained: true,
    writerFailurePresent: false,
    restartGateExitCode: 0,
    restartEightHourCaptures: true,
    postRunPreflightExitCode: 0,
    lockPresent: false,
    controlledReconnectRequestCount: 1,
    controlledReconnectRecoveryCycleId: 1,
    controlledReconnectRecoveryReason: "controlled-reconnect-validation",
    controlledReconnectAttemptCount: 1,
    controlledReconnectSuccessCount: 1,
    controlledReconnectFailureCount: 0,
    controlledReconnectProven: true,
    passed: true,
    failedChecks: [],
    ...overrides,
  };
}

async function runWrapper(options: {
  root: string;
  runId?: string;
  captureExitCode?: number;
  auditExitCode?: number;
  restartGateExitCode?: number;
  postRunPreflightExitCode?: number;
  lockPresent?: boolean;
  evaluateAcceptance?: (
    args: Parameters<
      NonNullable<
        Parameters<typeof runCaptureReconnectSmokeCommand>[1]["evaluateAcceptance"]
      >
    >[0],
  ) => ReconnectSmokeAcceptanceSummary;
  issueAuthorization?: typeof issueReconnectSmokeAuthorization;
  argv?: string[];
}): Promise<{ exitCode: number; stdout: string; runDir: string }> {
  const runId = options.runId ?? "reconnect-run";
  const runDir = join(options.root, runId);
  writeExactRunArtifacts(runDir, runId);
  const { io, stdout } = createIo();

  const exitCode = await runCaptureReconnectSmokeCommand(
    options.argv ?? ["--duration-minutes", "20"],
    {
      io,
      requireCredentials: false,
      lockExists: () => options.lockPresent === true,
      evaluateAcceptance:
        options.evaluateAcceptance
        ?? ((args) =>
          passingAcceptance(runId, runDir, {
            captureExitCode: args.captureExitCode,
            auditExitCode: args.auditExitCode,
            restartGateExitCode: args.restartGateExitCode,
            postRunPreflightExitCode: args.postRunPreflightExitCode,
            lockPresent: args.lockPresent,
            passed:
              args.captureExitCode === 0
              && args.auditExitCode === 0
              && args.restartGateExitCode === 0
              && args.postRunPreflightExitCode === 0
              && args.lockPresent === false,
            failedChecks:
              args.captureExitCode === 0
              && args.auditExitCode === 0
              && args.restartGateExitCode === 0
              && args.postRunPreflightExitCode === 0
              && args.lockPresent === false
                ? []
                : ["orchestration"],
          })),
      issueAuthorization: options.issueAuthorization,
      runner: mockRunner((script, argv) => {
        if (script.includes("runReconnectValidationCapture")) {
          return {
            exitCode: options.captureExitCode ?? 0,
            stdout:
              JSON.stringify({
                runId,
                outputDir: options.root,
                verdict: "ok",
                captureEndReason: "duration-complete",
              }) + "\n",
            stderr: "",
          };
        }
        if (script.includes("buildCaptureHealthAudit")) {
          return {
            exitCode: options.auditExitCode ?? 0,
            stdout: "",
            stderr: "",
          };
        }
        if (
          script.includes("evaluateCaptureRestartGate")
          && argv.includes("--capture-run-dir")
        ) {
          return {
            exitCode: options.restartGateExitCode ?? 0,
            stdout: "",
            stderr: "",
          };
        }
        if (argv.includes("--assert-no-active-capture")) {
          return {
            exitCode: options.postRunPreflightExitCode ?? 0,
            stdout: JSON.stringify({
              blockers: [],
              lockPresent: options.lockPresent === true,
            }) + "\n",
            stderr: "",
          };
        }
        return { exitCode: 0, stdout: "", stderr: "" };
      }),
    },
  );

  return { exitCode, stdout: stdout.join(""), runDir };
}

describe("runCaptureReconnectSmokeCommand", () => {
  it("preserves PR #41 lifecycle proof sequence in dry-run-plan", async () => {
    const { io, stdout } = createIo();
    const planned: string[] = [];
    const root = mkdtempSync(join(tmpdir(), "reconnect-dry-"));
    const exitCode = await runCaptureReconnectSmokeCommand(
      ["--duration-minutes", "20", "--dry-run-plan"],
      {
        io,
        runner: mockRunner((script, argv) => {
          planned.push(`${script} ${argv.join(" ")}`);
          return { exitCode: 0, stdout: "", stderr: "" };
        }),
      },
    );
    expect(exitCode).toBe(0);
    const text = stdout.join("");
    expect(text).toContain("forceReconnectAfterFirstValidTopOfBook");
    expect(text).toContain("in-process reconnect acceptance");
    expect(text).toContain("writes no authorization artifact");
    expect(planned.some((line) => line.includes("runReconnectValidationCapture.ts"))).toBe(
      true,
    );
    expect(planned.some((line) => line.includes("--series KXBTC15M"))).toBe(true);
    expect(existsSync(reconnectSmokeAuthorizationPath(join(root, "x")))).toBe(false);
    rmSync(root, { recursive: true, force: true });
  });

  it("always runs post-run preflight and named restart-gate arguments", async () => {
    const root = mkdtempSync(join(tmpdir(), "reconnect-smoke-"));
    const { exitCode, stdout, runDir } = await runWrapper({ root });
    expect(exitCode).toBe(0);
    expect(stdout).toContain("RECONNECT GATE PASSED");
    expect(stdout).toContain("Step 6/6");
    expect(existsSync(reconnectSmokeAuthorizationPath(runDir))).toBe(true);
    rmSync(root, { recursive: true, force: true });
  });

  it("writes exactly one passed authorization on complete success", async () => {
    const root = mkdtempSync(join(tmpdir(), "reconnect-success-"));
    const { exitCode, runDir } = await runWrapper({ root });
    expect(exitCode).toBe(0);
    const summary = readReconnectSmokeAuthorizationSummary(runDir);
    expect(summary.passed).toBe(true);
    expect(summary.controlledReconnectProven).toBe(true);
    rmSync(root, { recursive: true, force: true });
  });

  it("writes no authorization on capture failure", async () => {
    const root = mkdtempSync(join(tmpdir(), "reconnect-capfail-"));
    const { exitCode, runDir } = await runWrapper({
      root,
      captureExitCode: 1,
    });
    expect(exitCode).toBe(1);
    expect(existsSync(reconnectSmokeAuthorizationPath(runDir))).toBe(false);
    rmSync(root, { recursive: true, force: true });
  });

  it("writes no authorization on audit failure", async () => {
    const root = mkdtempSync(join(tmpdir(), "reconnect-auditfail-"));
    const { exitCode, runDir } = await runWrapper({
      root,
      auditExitCode: 2,
    });
    expect(exitCode).toBe(1);
    expect(existsSync(reconnectSmokeAuthorizationPath(runDir))).toBe(false);
    rmSync(root, { recursive: true, force: true });
  });

  it("writes no authorization on restart-gate failure", async () => {
    const root = mkdtempSync(join(tmpdir(), "reconnect-restartfail-"));
    const { exitCode, runDir } = await runWrapper({
      root,
      restartGateExitCode: 3,
    });
    expect(exitCode).toBe(1);
    expect(existsSync(reconnectSmokeAuthorizationPath(runDir))).toBe(false);
    rmSync(root, { recursive: true, force: true });
  });

  it("writes no authorization on post-run preflight failure", async () => {
    const root = mkdtempSync(join(tmpdir(), "reconnect-postfail-"));
    const { exitCode, runDir } = await runWrapper({
      root,
      postRunPreflightExitCode: 4,
    });
    expect(exitCode).toBe(1);
    expect(existsSync(reconnectSmokeAuthorizationPath(runDir))).toBe(false);
    rmSync(root, { recursive: true, force: true });
  });

  it("writes no authorization when lockPresent=true", async () => {
    const root = mkdtempSync(join(tmpdir(), "reconnect-lock-"));
    const { exitCode, runDir } = await runWrapper({
      root,
      lockPresent: true,
    });
    expect(exitCode).toBe(1);
    expect(existsSync(reconnectSmokeAuthorizationPath(runDir))).toBe(false);
    rmSync(root, { recursive: true, force: true });
  });

  it("writes no authorization when lifecycle does not prove controlled reconnect", async () => {
    const root = mkdtempSync(join(tmpdir(), "reconnect-lifecycle-"));
    const { exitCode, runDir } = await runWrapper({
      root,
      evaluateAcceptance: (args) =>
        passingAcceptance(args.runId, args.runDir, {
          ...args,
          controlledReconnectProven: false,
          passed: false,
          failedChecks: ["controlledReconnectProven=false"],
        }),
    });
    expect(exitCode).toBe(1);
    expect(existsSync(reconnectSmokeAuthorizationPath(runDir))).toBe(false);
    rmSync(root, { recursive: true, force: true });
  });

  it("dry-run-plan writes no authorization", async () => {
    const root = mkdtempSync(join(tmpdir(), "reconnect-dry-auth-"));
    const runDir = join(root, "reconnect-run");
    writeExactRunArtifacts(runDir, "reconnect-run");
    const { io } = createIo();
    const exitCode = await runCaptureReconnectSmokeCommand(
      ["--duration-minutes", "20", "--dry-run-plan"],
      {
        io,
        runner: mockRunner(() => ({ exitCode: 0, stdout: "", stderr: "" })),
      },
    );
    expect(exitCode).toBe(0);
    expect(existsSync(reconnectSmokeAuthorizationPath(runDir))).toBe(false);
    rmSync(root, { recursive: true, force: true });
  });

  it("refuses to overwrite an existing authorization and returns nonzero", async () => {
    const root = mkdtempSync(join(tmpdir(), "reconnect-overwrite-"));
    const runId = "reconnect-run";
    const runDir = join(root, runId);
    writeExactRunArtifacts(runDir, runId);
    const existingPath = writeReconnectSmokeAuthorizationSummary(
      runDir,
      buildReconnectSmokeAuthorizationSummary({
        acceptance: passingAcceptance(runId, runDir),
        gateExitCode: 0,
      }),
    );
    const before = readFileSync(existingPath, "utf8");

    const { exitCode, stdout } = await runWrapper({ root });
    expect(exitCode).toBe(1);
    expect(stdout).toMatch(/already exists|authorization issuance failed/i);
    expect(readFileSync(existingPath, "utf8")).toBe(before);
    rmSync(root, { recursive: true, force: true });
  });

  it("returns nonzero on authorization write failure without partial target", async () => {
    const root = mkdtempSync(join(tmpdir(), "reconnect-writefail-"));
    const { exitCode, runDir, stdout } = await runWrapper({
      root,
      issueAuthorization: () => {
        throw new Error("simulated write failure");
      },
    });
    expect(exitCode).toBe(1);
    expect(stdout).toMatch(/authorization issuance failed/);
    expect(existsSync(reconnectSmokeAuthorizationPath(runDir))).toBe(false);
    rmSync(root, { recursive: true, force: true });
  });

  it("does not invoke evaluateReconnectSmokeGate CLI or --write-authorization", async () => {
    const root = mkdtempSync(join(tmpdir(), "reconnect-no-cli-"));
    const calls: string[] = [];
    const { io } = createIo();
    const runId = "reconnect-run";
    const runDir = join(root, runId);
    writeExactRunArtifacts(runDir, runId);

    await runCaptureReconnectSmokeCommand(["--duration-minutes", "20"], {
      io,
      requireCredentials: false,
      lockExists: () => false,
      evaluateAcceptance: (args) =>
        passingAcceptance(runId, runDir, {
          captureExitCode: args.captureExitCode,
          auditExitCode: args.auditExitCode,
          restartGateExitCode: args.restartGateExitCode,
          postRunPreflightExitCode: args.postRunPreflightExitCode,
          lockPresent: args.lockPresent,
        }),
      runner: mockRunner((script, argv) => {
        calls.push(`${script} ${argv.join(" ")}`);
        if (script.includes("runReconnectValidationCapture")) {
          return {
            exitCode: 0,
            stdout: JSON.stringify({
              runId,
              outputDir: root,
              verdict: "ok",
              captureEndReason: "duration-complete",
            }) + "\n",
            stderr: "",
          };
        }
        return { exitCode: 0, stdout: "", stderr: "" };
      }),
    });

    expect(calls.some((line) => line.includes("evaluateReconnectSmokeGate"))).toBe(
      false,
    );
    expect(calls.some((line) => line.includes("--write-authorization"))).toBe(false);
    rmSync(root, { recursive: true, force: true });
  });

  it("rejects durations outside 15-20 and eight-hour attempts", async () => {
    const { io, stderr } = createIo();
    const tooLong = await runCaptureReconnectSmokeCommand(
      ["--duration-minutes", "25"],
      {
        io,
        requireCredentials: false,
        runner: mockRunner(() => ({ exitCode: 0, stdout: "", stderr: "" })),
      },
    );
    expect(tooLong).toBe(1);
    expect(stderr.join("")).toMatch(/between 15 and 20/);
  });
});
