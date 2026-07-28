import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import type { ReconnectSmokeAcceptanceSummary } from "../research/reconnectSmokeAcceptance/reconnectSmokeAcceptanceTypes";
import { evaluateReconnectSmokeAcceptance } from "../research/reconnectSmokeAcceptance/evaluateReconnectSmokeAcceptance";
import { runEvaluateReconnectSmokeGateCommand } from "../research/evaluateReconnectSmokeGate";
import { runCaptureWithProgressCommand } from "./runCaptureWithProgress";
import { runVerifyReconnectSmokeAuthorizationCommand } from "./verifyReconnectSmokeAuthorization";
import type { CommandIo, OperatorCommandRunner, RunTsxResult } from "./shared/commandRunner";
import {
  buildReconnectSmokeAuthorizationSummary,
  comparePersistedAuthorizationToCurrentAcceptance,
  issueReconnectSmokeAuthorization,
  normalizeRunDir,
  parseReconnectSmokeAuthorizationSummary,
  readReconnectSmokeAuthorizationSummary,
  reconnectSmokeAuthorizationPath,
  revalidateReconnectAuthorizationAgainstCurrentArtifacts,
  verifyPersistedReconnectSmokeAuthorization,
  writeReconnectSmokeAuthorizationSummary,
  type ReconnectSmokeAuthorizationSummary,
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

function writeExactRunArtifacts(
  runDir: string,
  runId: string,
  overrides?: {
    connectionAttemptCount?: number;
    authHeaderGenerationCount?: number;
    reconnectCount?: number;
    lifecycle?: string;
  },
): void {
  mkdirSync(runDir, { recursive: true });
  const connectionAttemptCount = overrides?.connectionAttemptCount ?? 2;
  const authHeaderGenerationCount =
    overrides?.authHeaderGenerationCount ?? connectionAttemptCount;
  const reconnectCount = overrides?.reconnectCount ?? 1;
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
        reconnectCount,
        connectionAttemptCount,
        authHeaderGenerationCount,
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
    `${overrides?.lifecycle ?? lifecycleForControlled(runId)}\n`,
    "utf8",
  );
}

function gateArgv(
  runId: string,
  runDir: string,
  overrides: Record<string, string> = {},
  extra: string[] = [],
): string[] {
  const values = {
    "--run-id": runId,
    "--run-dir": runDir,
    "--duration-minutes": "20",
    "--capture-exit-code": "0",
    "--audit-exit-code": "0",
    "--restart-gate-exit-code": "0",
    "--post-run-preflight-exit-code": "0",
    "--lock-present": "false",
    ...overrides,
  };
  const argv: string[] = [];
  for (const [flag, value] of Object.entries(values)) {
    argv.push(flag, value);
  }
  argv.push(...extra);
  return argv;
}

describe("reconnect smoke authorization artifact", () => {
  it("issues exact authorization evidence from a successful reconnect acceptance", () => {
    const root = mkdtempSync(join(tmpdir(), "reconnect-auth-"));
    dirs.push(root);
    const runId = "reconnect-run";
    const runDir = join(root, runId);
    writeExactRunArtifacts(runDir, runId);

    const path = issueReconnectSmokeAuthorization({
      runDir,
      acceptance: passingAcceptance({ runId, runDir }),
      generatedAt: "2026-07-22T00:21:00.000Z",
    });
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
      ["duration too short", { durationMinutes: 10 }],
      ["duration too long", { durationMinutes: 25 }],
      ["bad nativeVerdict", { nativeVerdict: "capture-mvp-fail" }],
      ["auditSelectedRunId mismatch", { auditSelectedRunId: "other-run" }],
      ["runStatusState not completed", { runStatusState: "failed" }],
      ["captureEndReason wrong", { captureEndReason: "operator-stop" }],
      ["reconnectCount zero", { reconnectCount: 0 }],
      ["connectionAttemptCount one", { connectionAttemptCount: 1 }],
      ["authHeaderGenerationCount one", { authHeaderGenerationCount: 1 }],
      ["auth != attempts", { connectionAttemptCount: 2, authHeaderGenerationCount: 3 }],
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

describe("fresh authentication invariant", () => {
  it("requires authHeaderGenerationCount === connectionAttemptCount", () => {
    const root = mkdtempSync(join(tmpdir(), "auth-eq-"));
    dirs.push(root);
    const runDir = join(root, "reconnect-run");
    mkdirSync(runDir, { recursive: true });

    for (const [attempts, auth, expectOk] of [
      [2, 1, false],
      [2, 3, false],
      [3, 2, false],
      [3, 3, true],
      [2, 2, true],
    ] as const) {
      const summary = buildReconnectSmokeAuthorizationSummary({
        acceptance: passingAcceptance({
          runId: "reconnect-run",
          runDir,
          connectionAttemptCount: attempts,
          authHeaderGenerationCount: auth,
        }),
        gateExitCode: 0,
      });
      const verified = verifyPersistedReconnectSmokeAuthorization({
        expectedRunDir: runDir,
        summary,
      });
      expect(verified.ok, `attempts=${attempts} auth=${auth}`).toBe(expectOk);
      if (!expectOk) {
        expect(verified.ok ? [] : verified.reasons.join("")).toMatch(
          /authHeaderGenerationCount=.*connectionAttemptCount/,
        );
      }
    }
  });
});

describe("persisted/current consistency", () => {
  const consistencyFields: Array<keyof ReconnectSmokeAuthorizationSummary> = [
    "auditSelectedRunId",
    "nativeVerdict",
    "nativeErrorCount",
    "runStatusState",
    "captureEndReason",
    "completedNormally",
    "liveConnectionSucceeded",
    "controlledReconnectProven",
    "reconnectCount",
    "connectionAttemptCount",
    "authHeaderGenerationCount",
    "wsRecoveryFailureCount",
    "terminalWebSocketFailure",
    "allStreamsDrained",
    "writerFailurePresent",
  ];

  it("denies when each persisted field disagrees with current acceptance", () => {
    const root = mkdtempSync(join(tmpdir(), "consistency-"));
    dirs.push(root);
    const runId = "reconnect-run";
    const runDir = join(root, runId);
    writeExactRunArtifacts(runDir, runId);

    const current = passingAcceptance({ runId, runDir });
    const mutations: Partial<Record<keyof ReconnectSmokeAuthorizationSummary, unknown>> = {
      auditSelectedRunId: "other-run",
      nativeVerdict: "capture-mvp-fail",
      nativeErrorCount: 1,
      runStatusState: "failed",
      captureEndReason: "operator-stop",
      completedNormally: false,
      liveConnectionSucceeded: false,
      controlledReconnectProven: false,
      reconnectCount: 9,
      connectionAttemptCount: 9,
      authHeaderGenerationCount: 9,
      wsRecoveryFailureCount: 1,
      terminalWebSocketFailure: true,
      allStreamsDrained: false,
      writerFailurePresent: true,
    };

    for (const field of consistencyFields) {
      const base = buildReconnectSmokeAuthorizationSummary({
        acceptance: current,
        gateExitCode: 0,
      });
      const mutated = {
        ...base,
        [field]: mutations[field],
        // Keep gateExitCode/passed so compare focuses on the field under test.
        passed: true,
        gateExitCode: 0,
      } as ReconnectSmokeAuthorizationSummary;
      const reasons = comparePersistedAuthorizationToCurrentAcceptance({
        summary: mutated,
        current,
        expectedRunDir: runDir,
      });
      expect(reasons.some((r) => r.startsWith(`${field} mismatch`)), field).toBe(
        true,
      );
    }
  });

  it("denies when current artifacts diverge from persisted authorization", () => {
    const root = mkdtempSync(join(tmpdir(), "consistency-current-"));
    dirs.push(root);
    const runId = "reconnect-run";
    const runDir = join(root, runId);
    writeExactRunArtifacts(runDir, runId);
    const summary = buildReconnectSmokeAuthorizationSummary({
      acceptance: passingAcceptance({ runId, runDir }),
      gateExitCode: 0,
    });
    writeReconnectSmokeAuthorizationSummary(runDir, summary);

    // Mutate current health reconnectCount while leaving authorization unchanged.
    const healthPath = join(runDir, "capture-health.json");
    const health = JSON.parse(readFileSync(healthPath, "utf8")) as {
      connection: { reconnectCount: number };
    };
    health.connection.reconnectCount = 7;
    writeFileSync(healthPath, JSON.stringify(health), "utf8");

    const statusRecord = JSON.parse(
      readFileSync(join(runDir, "capture-run-status.json"), "utf8"),
    ) as Record<string, unknown>;
    const healthRecord = JSON.parse(readFileSync(healthPath, "utf8")) as Record<
      string,
      unknown
    >;
    const auditRecord = JSON.parse(
      readFileSync(join(runDir, "capture-health-audit.json"), "utf8"),
    ) as Record<string, unknown>;
    const lifecycleJsonl = readFileSync(
      join(runDir, "capture-lifecycle.jsonl"),
      "utf8",
    );

    const result = revalidateReconnectAuthorizationAgainstCurrentArtifacts({
      expectedRunDir: runDir,
      summary,
      statusRecord,
      healthRecord,
      auditRecord,
      lifecycleJsonl,
      evaluateAcceptance: (input) =>
        evaluateReconnectSmokeAcceptance({
          ...input,
          status: input.status as never,
          health: input.health as never,
          audit: input.audit as never,
        }),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reasons.join("; ")).toMatch(/reconnectCount mismatch/);
    }
  });
});

describe("evaluateReconnectSmokeGate evaluation-only trust boundary", () => {
  it("passing invocation exits 0 and writes no authorization", () => {
    const root = mkdtempSync(join(tmpdir(), "gate-pass-"));
    dirs.push(root);
    const runId = "reconnect-run";
    const runDir = join(root, runId);
    writeExactRunArtifacts(runDir, runId);

    const exitCode = runEvaluateReconnectSmokeGateCommand(
      gateArgv(runId, runDir),
      { writeStdout: () => {}, writeStderr: () => {} },
    );
    expect(exitCode).toBe(0);
    expect(existsSync(reconnectSmokeAuthorizationPath(runDir))).toBe(false);
  });

  it("failing invocation exits 1 and writes no authorization", () => {
    const root = mkdtempSync(join(tmpdir(), "gate-fail-"));
    dirs.push(root);
    const runId = "reconnect-run";
    const runDir = join(root, runId);
    writeExactRunArtifacts(runDir, runId);

    const exitCode = runEvaluateReconnectSmokeGateCommand(
      gateArgv(runId, runDir, { "--capture-exit-code": "1" }),
      { writeStdout: () => {}, writeStderr: () => {} },
    );
    expect(exitCode).toBe(1);
    expect(existsSync(reconnectSmokeAuthorizationPath(runDir))).toBe(false);
  });

  it("rejects --write-authorization as unknown and writes nothing", () => {
    const root = mkdtempSync(join(tmpdir(), "gate-unknown-"));
    dirs.push(root);
    const runId = "reconnect-run";
    const runDir = join(root, runId);
    writeExactRunArtifacts(runDir, runId);

    const stderr: string[] = [];
    const exitCode = runEvaluateReconnectSmokeGateCommand(
      gateArgv(runId, runDir, {}, ["--write-authorization"]),
      {
        writeStdout: () => {},
        writeStderr: (text) => stderr.push(text),
      },
    );
    expect(exitCode).toBe(1);
    expect(stderr.join("")).toMatch(/Unknown flag: --write-authorization/);
    expect(existsSync(reconnectSmokeAuthorizationPath(runDir))).toBe(false);
  });

  it("fabricated zero orchestration values cannot mint authorization via CLI", () => {
    const root = mkdtempSync(join(tmpdir(), "gate-fabricate-"));
    dirs.push(root);
    const runId = "reconnect-run";
    const runDir = join(root, runId);
    writeExactRunArtifacts(runDir, runId);

    const exitCode = runEvaluateReconnectSmokeGateCommand(
      gateArgv(runId, runDir, {
        "--capture-exit-code": "0",
        "--audit-exit-code": "0",
        "--restart-gate-exit-code": "0",
        "--post-run-preflight-exit-code": "0",
        "--lock-present": "false",
      }),
      { writeStdout: () => {}, writeStderr: () => {} },
    );
    expect(exitCode).toBe(0);
    expect(existsSync(reconnectSmokeAuthorizationPath(runDir))).toBe(false);
  });
});

describe("issueReconnectSmokeAuthorization", () => {
  it("refuses to overwrite an existing authorization file", () => {
    const root = mkdtempSync(join(tmpdir(), "issue-exists-"));
    dirs.push(root);
    const runId = "reconnect-run";
    const runDir = join(root, runId);
    writeExactRunArtifacts(runDir, runId);
    const first = issueReconnectSmokeAuthorization({
      runDir,
      acceptance: passingAcceptance({ runId, runDir }),
    });
    const before = readFileSync(first, "utf8");
    expect(() =>
      issueReconnectSmokeAuthorization({
        runDir,
        acceptance: passingAcceptance({ runId, runDir }),
      }),
    ).toThrow(/already exists/);
    expect(readFileSync(first, "utf8")).toBe(before);
  });

  it("refuses failed acceptance and leaves no artifact", () => {
    const root = mkdtempSync(join(tmpdir(), "issue-fail-"));
    dirs.push(root);
    const runId = "reconnect-run";
    const runDir = join(root, runId);
    writeExactRunArtifacts(runDir, runId);
    expect(() =>
      issueReconnectSmokeAuthorization({
        runDir,
        acceptance: passingAcceptance({
          runId,
          runDir,
          passed: false,
          captureExitCode: 1,
        }),
      }),
    ).toThrow(/passed=false/);
    expect(existsSync(reconnectSmokeAuthorizationPath(runDir))).toBe(false);
  });

  it("cleans temp and returns error when write fails", () => {
    const root = mkdtempSync(join(tmpdir(), "issue-writefail-"));
    dirs.push(root);
    const runId = "reconnect-run";
    const runDir = join(root, runId);
    writeExactRunArtifacts(runDir, runId);

    expect(() =>
      issueReconnectSmokeAuthorization({
        runDir,
        acceptance: passingAcceptance({ runId, runDir }),
        writeSummary: () => {
          throw new Error("simulated write failure");
        },
      }),
    ).toThrow(/simulated write failure/);
    expect(existsSync(reconnectSmokeAuthorizationPath(runDir))).toBe(false);
    const temps = readdirSync(runDir).filter((name) => name.includes(".tmp"));
    expect(temps).toEqual([]);
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

  it("persisted/current reconnect-count mismatch prevents eight-hour child spawn", async () => {
    const root = mkdtempSync(join(tmpdir(), "eight-hour-mismatch-"));
    dirs.push(root);
    const restartDir = join(root, "restart-run");
    const reconnectDir = join(root, "reconnect-run");
    mkdirSync(restartDir, { recursive: true });
    writeExactRunArtifacts(reconnectDir, "reconnect-run");
    writeReconnectSmokeAuthorizationSummary(
      reconnectDir,
      buildReconnectSmokeAuthorizationSummary({
        acceptance: passingAcceptance({
          runId: "reconnect-run",
          runDir: reconnectDir,
          reconnectCount: 1,
        }),
        gateExitCode: 0,
      }),
    );
    // Current health diverges from persisted authorization.
    const healthPath = join(reconnectDir, "capture-health.json");
    const health = JSON.parse(readFileSync(healthPath, "utf8")) as {
      connection: { reconnectCount: number };
    };
    health.connection.reconnectCount = 4;
    writeFileSync(healthPath, JSON.stringify(health), "utf8");

    const { io } = createIo();
    let spawnAttempted = false;
    const exitCode = await runCaptureWithProgressCommand(
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
        exists: (path) =>
          path === restartDir
          || path === reconnectDir
          || path.endsWith("capture-run-status.json")
          || path.endsWith("capture-health.json")
          || path.endsWith("capture-health-audit.json")
          || path.endsWith("capture-lifecycle.jsonl")
          || path.endsWith("reconnect-smoke-authorization.json"),
        mkdirp: () => undefined,
        runner: mockRunner((script, argv) => {
          if (argv.includes("--assert-no-active-capture")) {
            return {
              exitCode: 0,
              stdout: JSON.stringify({ blockers: [], lockPresent: false }) + "\n",
              stderr: "",
            };
          }
          if (script.includes("evaluateCaptureRestartGate") && argv.includes("--capture-run-dir")) {
            return { exitCode: 0, stdout: "", stderr: "" };
          }
          if (script.includes("verifyReconnectSmokeAuthorization")) {
            // Exercise the real verifier path via in-process call below is better;
            // here we simulate denial from the verifier subprocess.
            return {
              exitCode: 1,
              stdout: "",
              stderr: "reconnectCount mismatch (authorization=1, current=4)\n",
            };
          }
          if (script.includes("runForwardQuoteCapture")) {
            spawnAttempted = true;
            return { exitCode: 0, stdout: "", stderr: "" };
          }
          return { exitCode: 0, stdout: "", stderr: "" };
        }),
      },
    );
    expect(exitCode).toBe(1);
    expect(spawnAttempted).toBe(false);

    // Also prove the real verifier denies the mismatch without spawning.
    const verifyExit = await runVerifyReconnectSmokeAuthorizationCommand(
      ["--run-dir", reconnectDir],
      {
        io: createIo().io,
        runner: mockRunner(() => ({ exitCode: 0, stdout: "", stderr: "" })),
      },
    );
    expect(verifyExit).toBe(1);
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

describe("verifyReconnectSmokeAuthorization artifact revalidation", () => {
  it("accepts a conforming authorization after current-artifact re-evaluation", async () => {
    const root = mkdtempSync(join(tmpdir(), "verify-ok-"));
    dirs.push(root);
    const runId = "reconnect-run";
    const runDir = join(root, runId);
    writeExactRunArtifacts(runDir, runId);
    writeReconnectSmokeAuthorizationSummary(
      runDir,
      buildReconnectSmokeAuthorizationSummary({
        acceptance: passingAcceptance({ runId, runDir }),
        gateExitCode: 0,
      }),
    );

    const { io } = createIo();
    const exitCode = await runVerifyReconnectSmokeAuthorizationCommand(
      ["--run-dir", runDir],
      {
        io,
        runner: mockRunner(() => ({ exitCode: 0, stdout: "", stderr: "" })),
      },
    );
    expect(exitCode).toBe(0);
  });

  it("denies when current lifecycle no longer proves controlled reconnect", async () => {
    const root = mkdtempSync(join(tmpdir(), "verify-lifecycle-"));
    dirs.push(root);
    const runId = "reconnect-run";
    const runDir = join(root, runId);
    writeExactRunArtifacts(runDir, runId);
    writeReconnectSmokeAuthorizationSummary(
      runDir,
      buildReconnectSmokeAuthorizationSummary({
        acceptance: passingAcceptance({ runId, runDir }),
        gateExitCode: 0,
      }),
    );
    writeFileSync(
      join(runDir, "capture-lifecycle.jsonl"),
      `${JSON.stringify({
        runId,
        type: "naturalRecoverySucceeded",
        detectedAt: "2026-07-22T00:00:12.000Z",
      })}\n`,
      "utf8",
    );

    const { io, stderr } = createIo();
    const exitCode = await runVerifyReconnectSmokeAuthorizationCommand(
      ["--run-dir", runDir],
      {
        io,
        runner: mockRunner(() => ({ exitCode: 0, stdout: "", stderr: "" })),
      },
    );
    expect(exitCode).toBe(1);
    expect(stderr.join("")).toMatch(/revalidation failed|controlledReconnectProven/i);
  });
});
