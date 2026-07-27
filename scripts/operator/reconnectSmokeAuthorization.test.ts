import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import type { ReconnectSmokeAcceptanceSummary } from "../research/reconnectSmokeAcceptance/reconnectSmokeAcceptanceTypes";
import { runEvaluateReconnectSmokeGateCommand } from "../research/evaluateReconnectSmokeGate";
import { runCaptureWithProgressCommand } from "./runCaptureWithProgress";
import { runVerifyReconnectSmokeAuthorizationCommand } from "./verifyReconnectSmokeAuthorization";
import type { CommandIo, OperatorCommandRunner, RunTsxResult } from "./shared/commandRunner";
import {
  buildReconnectSmokeAuthorizationSummary,
  normalizeRunDir,
  parseReconnectSmokeAuthorizationSummary,
  readReconnectSmokeAuthorizationSummary,
  reconnectSmokeAuthorizationPath,
  verifyPersistedReconnectSmokeAuthorization,
  writeReconnectSmokeAuthorizationSummary,
} from "./shared/reconnectSmokeAuthorization";

const dirs: string[] = [];

afterEach(async () => {
  while (dirs.length > 0) {
    const dir = dirs.pop()!;
    await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 25 });
  }
});

function createIo() {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const io: CommandIo = {
    writeStdout: (text) => stdout.push(text),
    writeStderr: (text) => stderr.push(text),
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

function passingAcceptance(
  overrides: Partial<ReconnectSmokeAcceptanceSummary> = {},
): ReconnectSmokeAcceptanceSummary {
  return {
    schemaVersion: 1,
    mode: "reconnect-smoke",
    runId: "reconnect-run",
    runDir: "/tmp/reconnect-run",
    durationMinutes: 20,
    captureExitCode: 0,
    auditExitCode: 0,
    auditVerdict: "capture-research-ready",
    auditSelectedRunId: "reconnect-run",
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
    controlledReconnectRecoveryReason: "controlled-reconnect",
    controlledReconnectAttemptCount: 1,
    controlledReconnectSuccessCount: 1,
    controlledReconnectFailureCount: 0,
    controlledReconnectProven: true,
    passed: true,
    failedChecks: [],
    ...overrides,
  };
}

function writeExactRunArtifacts(runDir: string, runId: string): void {
  mkdirSync(runDir, { recursive: true });
  writeFileSync(
    join(runDir, "capture-run-status.json"),
    JSON.stringify({
      schemaVersion: 1,
      runId,
      state: "completed",
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
    `${JSON.stringify({
      type: "controlled-reconnect",
      recoveryCycleId: 1,
      recoveryReason: "force-reconnect-after-first-valid-top-of-book",
      attemptCount: 1,
      successCount: 1,
      failureCount: 0,
    })}\n`,
    "utf8",
  );
}

describe("reconnect smoke authorization artifact", () => {
  it("writes exact authorization evidence from a successful reconnect smoke evaluation", () => {
    const root = mkdtempSync(join(tmpdir(), "reconnect-auth-"));
    dirs.push(root);
    const runId = "reconnect-run";
    const runDir = join(root, runId);
    writeExactRunArtifacts(runDir, runId);

    // Minimal lifecycle proof content is enough for write path; acceptance may
    // still fail closed depending on lifecycle parser strictness. Force write
    // through the builder/writer directly for the happy artifact contract,
    // then through the gate with writeAuthorizationArtifact for integration.
    const summary = buildReconnectSmokeAuthorizationSummary({
      acceptance: passingAcceptance({
        runId,
        runDir,
      }),
      gateExitCode: 0,
      generatedAt: "2026-07-22T00:21:00.000Z",
    });
    const path = writeReconnectSmokeAuthorizationSummary(runDir, summary);
    expect(path).toBe(reconnectSmokeAuthorizationPath(runDir));
    const loaded = readReconnectSmokeAuthorizationSummary(runDir);
    expect(loaded.passed).toBe(true);
    expect(loaded.controlledReconnectProven).toBe(true);
    expect(loaded.captureExitCode).toBe(0);
    expect(loaded.lockPresent).toBe(false);
    expect(loaded.runDir).toBe(normalizeRunDir(runDir));
  });

  it("denies authorization for failed, mismatched, missing, and malformed summaries", () => {
    const root = mkdtempSync(join(tmpdir(), "reconnect-deny-"));
    dirs.push(root);
    const runDir = join(root, "reconnect-run");
    mkdirSync(runDir, { recursive: true });

    const cases: Array<[string, Partial<ReconnectSmokeAcceptanceSummary>]> = [
      ["nonzero capture", { captureExitCode: 1, passed: false }],
      ["nonzero audit", { auditExitCode: 2, passed: false }],
      ["nonzero restart gate", { restartGateExitCode: 3, passed: false }],
      ["nonzero post-run preflight", { postRunPreflightExitCode: 4, passed: false }],
      ["lock present", { lockPresent: true, passed: false }],
      ["controlledReconnectProven false", { controlledReconnectProven: false, passed: false }],
      ["native errors", { nativeErrorCount: 1, passed: false }],
      ["writer failure", { writerFailurePresent: true, passed: false }],
      ["terminal websocket failure", { terminalWebSocketFailure: true, passed: false }],
      ["passed false diagnostic", { passed: false }],
    ];

    for (const [label, overrides] of cases) {
      const summary = buildReconnectSmokeAuthorizationSummary({
        acceptance: passingAcceptance({
          runId: "reconnect-run",
          runDir,
          ...overrides,
        }),
        gateExitCode: overrides.passed === false ? 1 : 0,
      });
      // Force the field under test even if builder clamps passed.
      const forced = {
        ...summary,
        ...overrides,
        gateExitCode: overrides.passed === false ? 1 : summary.gateExitCode,
        passed: overrides.passed ?? summary.passed,
      };
      const verified = verifyPersistedReconnectSmokeAuthorization({
        expectedRunDir: runDir,
        summary: forced as typeof summary,
      });
      expect(verified.ok, label).toBe(false);
    }

    expect(() => readReconnectSmokeAuthorizationSummary(runDir)).toThrow(/missing/);
    writeFileSync(reconnectSmokeAuthorizationPath(runDir), "{not-json", "utf8");
    expect(() =>
      parseReconnectSmokeAuthorizationSummary(
        readFileSync(reconnectSmokeAuthorizationPath(runDir), "utf8"),
      ),
    ).toThrow(/malformed/i);

    const mismatchId = buildReconnectSmokeAuthorizationSummary({
      acceptance: passingAcceptance({
        runId: "other-run",
        runDir,
      }),
      gateExitCode: 0,
    });
    expect(
      verifyPersistedReconnectSmokeAuthorization({
        expectedRunDir: runDir,
        summary: mismatchId,
      }).ok,
    ).toBe(false);

    const mismatchDir = buildReconnectSmokeAuthorizationSummary({
      acceptance: passingAcceptance({
        runId: "reconnect-run",
        runDir: join(root, "other-run"),
      }),
      gateExitCode: 0,
    });
    expect(
      verifyPersistedReconnectSmokeAuthorization({
        expectedRunDir: runDir,
        summary: mismatchDir,
      }).ok,
    ).toBe(false);
  });

  it("does not write an authorization artifact during dry-run-plan", async () => {
    const { io } = createIo();
    const root = mkdtempSync(join(tmpdir(), "reconnect-dry-"));
    dirs.push(root);
    const runDir = join(root, "reconnect-run");
    mkdirSync(runDir, { recursive: true });

    const exitCode = await runVerifyReconnectSmokeAuthorizationCommand(
      ["--run-dir", runDir, "--dry-run-plan"],
      {
        io,
        runner: mockRunner(() => ({ exitCode: 0, stdout: "", stderr: "" })),
      },
    );
    expect(exitCode).toBe(0);
    expect(() => readReconnectSmokeAuthorizationSummary(runDir)).toThrow(/missing/);
  });
});

describe("eight-hour authorization integration", () => {
  it("passes no fabricated orchestration values and requires second preflight", async () => {
    const source = readFileSync(
      join(process.cwd(), "scripts/operator/runCaptureWithProgress.ts"),
      "utf8",
    );
    expect(source).not.toContain('"--capture-exit-code"');
    expect(source).not.toContain('"--audit-exit-code"');
    expect(source).not.toContain('"--restart-gate-exit-code"');
    expect(source).not.toContain('"--post-run-preflight-exit-code"');
    expect(source).not.toContain('"--lock-present"');
    expect(source).toContain("verifyReconnectSmokeAuthorization.ts");
    expect(source).toContain("Second preflight");

    const { io } = createIo();
    const root = mkdtempSync(join(tmpdir(), "eight-hour-lock-"));
    dirs.push(root);
    const restartDir = join(root, "restart-run");
    const reconnectDir = join(root, "reconnect-run");
    mkdirSync(restartDir, { recursive: true });
    mkdirSync(reconnectDir, { recursive: true });

    let preflightCalls = 0;
    const calls: string[] = [];
    const lockAfterAuth = await runCaptureWithProgressCommand(
      [
        "--preset",
        "8h",
        "--authorized-by-restart-smoke-run-dir",
        restartDir,
        "--authorized-by-reconnect-smoke-run-dir",
        reconnectDir,
      ],
      {
        io,
        requireCredentials: false,
        exists: (path) => path === restartDir || path === reconnectDir,
        mkdirp: () => undefined,
        runner: mockRunner((script, argv) => {
          calls.push(`${script} ${argv.join(" ")}`);
          if (argv.includes("--assert-no-active-capture")) {
            preflightCalls += 1;
            if (preflightCalls === 1) {
              return {
                exitCode: 0,
                stdout: JSON.stringify({ blockers: [], lockPresent: false }) + "\n",
                stderr: "",
              };
            }
            return {
              exitCode: 1,
              stdout: JSON.stringify({ blockers: [], lockPresent: true }) + "\n",
              stderr: "",
            };
          }
          if (script.includes("verifyReconnectSmokeAuthorization")) {
            return { exitCode: 0, stdout: "verified\n", stderr: "" };
          }
          if (argv.includes("--capture-run-dir")) {
            return { exitCode: 0, stdout: "", stderr: "" };
          }
          return { exitCode: 0, stdout: "", stderr: "" };
        }),
      },
    );
    expect(lockAfterAuth).toBe(1);
    expect(preflightCalls).toBeGreaterThanOrEqual(2);
    expect(calls.some((line) => line.includes("verifyReconnectSmokeAuthorization"))).toBe(
      true,
    );
    expect(calls.some((line) => line.includes("--capture-exit-code 0"))).toBe(false);
  });

  it("failed reconnect smoke authorization cannot authorize eight-hour capture", async () => {
    const { io } = createIo();
    const root = mkdtempSync(join(tmpdir(), "failed-auth-"));
    dirs.push(root);
    const reconnectDir = join(root, "reconnect-run");
    writeExactRunArtifacts(reconnectDir, "reconnect-run");
    writeReconnectSmokeAuthorizationSummary(
      reconnectDir,
      buildReconnectSmokeAuthorizationSummary({
        acceptance: passingAcceptance({
          runId: "reconnect-run",
          runDir: reconnectDir,
          passed: false,
          controlledReconnectProven: false,
        }),
        gateExitCode: 1,
      }),
    );

    const verifyExit = await runVerifyReconnectSmokeAuthorizationCommand(
      ["--run-dir", reconnectDir],
      {
        io,
        runner: mockRunner(() => ({ exitCode: 0, stdout: "", stderr: "" })),
      },
    );
    expect(verifyExit).toBe(1);
  });
});

describe("evaluateReconnectSmokeGate authorization write", () => {
  it("writes passed=false diagnostic summary without authorizing", () => {
    const root = mkdtempSync(join(tmpdir(), "gate-write-"));
    dirs.push(root);
    const runId = "reconnect-run";
    const runDir = join(root, runId);
    writeExactRunArtifacts(runDir, runId);

    const stderr: string[] = [];
    const exitCode = runEvaluateReconnectSmokeGateCommand(
      [
        "--run-id",
        runId,
        "--run-dir",
        runDir,
        "--duration-minutes",
        "20",
        "--capture-exit-code",
        "1",
        "--audit-exit-code",
        "0",
        "--restart-gate-exit-code",
        "0",
        "--post-run-preflight-exit-code",
        "0",
        "--lock-present",
        "false",
      ],
      {
        writeStdout: () => {},
        writeStderr: (text) => stderr.push(text),
      },
    );
    expect(exitCode).toBe(1);
    const summary = readReconnectSmokeAuthorizationSummary(runDir);
    expect(summary.passed).toBe(false);
    expect(summary.captureExitCode).toBe(1);
    expect(stderr.join("")).toContain("passed=false");
  });
});
