import { describe, expect, it } from "vitest";

import { evaluateReconnectSmokeAcceptance } from "./evaluateReconnectSmokeAcceptance";
import type { ReconnectSmokeAcceptanceInput } from "./reconnectSmokeAcceptanceTypes";
import { RECONNECT_SMOKE_ACCEPTANCE_SCHEMA_VERSION } from "./reconnectSmokeAcceptanceTypes";

function baseInput(
  overrides: Partial<ReconnectSmokeAcceptanceInput> = {},
): ReconnectSmokeAcceptanceInput {
  return {
    schemaVersion: RECONNECT_SMOKE_ACCEPTANCE_SCHEMA_VERSION,
    mode: "reconnect-smoke",
    runId: "run-abc",
    runDir: "data/live-capture/forward-quotes/run-abc",
    durationMinutes: 20,
    captureExitCode: 0,
    auditExitCode: 0,
    restartGateExitCode: 0,
    postRunPreflightExitCode: 0,
    lockPresent: false,
    status: {
      schemaVersion: 1,
      runId: "run-abc",
      state: "completed",
      endedAt: "2026-07-22T00:20:00.000Z",
      captureEndReason: "duration-complete",
      failureReason: null,
    },
    health: {
      runId: "run-abc",
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
    },
    audit: {
      summary: { verdict: "capture-research-ready" },
    },
    ...overrides,
  };
}

describe("evaluateReconnectSmokeAcceptance", () => {
  it("passes a conforming exact-run reconnect smoke observation", () => {
    const summary = evaluateReconnectSmokeAcceptance(baseInput());
    expect(summary.passed).toBe(true);
    expect(summary.failedChecks).toEqual([]);
    expect(summary.restartEightHourCaptures).toBe(true);
    expect(summary.auditVerdict).toBe("capture-research-ready");
    expect(summary.nativeVerdict).toBe("capture-mvp-success");
    expect(summary.nativeErrorCount).toBe(0);
    expect(summary.allStreamsDrained).toBe(true);
    expect(summary.writerFailurePresent).toBe(false);
    expect(summary.lockPresent).toBe(false);
  });

  it.each([
    ["capture-exit", { captureExitCode: 1 }, "capture-exit"],
    ["audit-exit", { auditExitCode: 1 }, "capture-health-audit"],
    ["restart-gate", { restartGateExitCode: 1 }, "restart-gate"],
    ["post-run-preflight", { postRunPreflightExitCode: 1 }, "post-run-preflight"],
    ["lock-present", { lockPresent: true }, "capture.lock-present"],
    [
      "audit-verdict",
      { audit: { summary: { verdict: "capture-too-short" } } },
      "auditVerdict=",
    ],
    ["status-missing", { status: null }, "status-missing"],
    ["health-missing", { health: null }, "health-missing"],
  ] as const)("fails closed on %s", (_label, overrides, needle) => {
    const summary = evaluateReconnectSmokeAcceptance(baseInput(overrides));
    expect(summary.passed).toBe(false);
    expect(summary.failedChecks.some((check) => check.includes(needle))).toBe(true);
  });

  it("fails when status is not completed duration-complete", () => {
    const summary = evaluateReconnectSmokeAcceptance(
      baseInput({
        status: {
          schemaVersion: 1,
          runId: "run-abc",
          state: "failed",
          endedAt: "2026-07-22T00:20:00.000Z",
          captureEndReason: "terminal-websocket-failure",
          failureReason: "boom",
        },
      }),
    );
    expect(summary.passed).toBe(false);
    expect(summary.failedChecks).toEqual(
      expect.arrayContaining([
        "status.state=failed",
        "status.captureEndReason=terminal-websocket-failure",
        "status.failureReason=boom",
      ]),
    );
  });

  it("fails when status runId mismatches", () => {
    const summary = evaluateReconnectSmokeAcceptance(
      baseInput({
        status: {
          schemaVersion: 1,
          runId: "other",
          state: "completed",
          endedAt: "2026-07-22T00:20:00.000Z",
          captureEndReason: "duration-complete",
          failureReason: null,
        },
      }),
    );
    expect(summary.passed).toBe(false);
    expect(
      summary.failedChecks.some((check) => check.includes("status.runId-mismatch")),
    ).toBe(true);
  });

  it("fails when native verdict is not capture-mvp-success or errors are nonempty", () => {
    const summary = evaluateReconnectSmokeAcceptance(
      baseInput({
        health: {
          runId: "run-abc",
          verdict: "degraded-capture",
          errors: ["Unexpected server response: 401"],
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
          writer: { allStreamsDrained: true, failure: null },
        },
      }),
    );
    expect(summary.passed).toBe(false);
    expect(summary.failedChecks).toEqual(
      expect.arrayContaining([
        "nativeVerdict=degraded-capture",
        "native-errors-nonempty (1)",
      ]),
    );
  });

  it("fails when recovery failures or writer drain invariants are broken", () => {
    const summary = evaluateReconnectSmokeAcceptance(
      baseInput({
        health: {
          runId: "run-abc",
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
            wsRecoveryFailureCount: 1,
            terminalWebSocketFailure: false,
          },
          writer: {
            allStreamsDrained: false,
            failure: { artifact: "raw", reason: "disk full" },
          },
        },
      }),
    );
    expect(summary.passed).toBe(false);
    expect(summary.failedChecks).toEqual(
      expect.arrayContaining([
        "wsRecoveryFailureCount=1",
        "allStreamsDrained=false",
        "writer.failure-present",
      ]),
    );
  });

  it("fails when reconnect evidence is missing (null not coerced to zero)", () => {
    const summary = evaluateReconnectSmokeAcceptance(
      baseInput({
        health: {
          runId: "run-abc",
          verdict: "capture-mvp-success",
          errors: [],
          connection: {
            completedNormally: true,
            liveConnectionSucceeded: true,
            captureEndReason: "duration-complete",
            terminalFailureReason: null,
            reconnectCount: null,
            connectionAttemptCount: null,
            authHeaderGenerationCount: null,
          },
          watchdog: null,
          writer: { allStreamsDrained: true, failure: null },
        },
      }),
    );
    expect(summary.passed).toBe(false);
    expect(summary.failedChecks).toEqual(
      expect.arrayContaining([
        "reconnectCount=null",
        "connectionAttemptCount=null",
        "authHeaderGenerationCount=null",
        "health.watchdog-missing",
      ]),
    );
  });

  it("reports restartEightHourCaptures true only when restart gate exit is 0", () => {
    const passed = evaluateReconnectSmokeAcceptance(baseInput());
    expect(passed.restartEightHourCaptures).toBe(true);
    const failed = evaluateReconnectSmokeAcceptance(
      baseInput({ restartGateExitCode: 2 }),
    );
    expect(failed.restartEightHourCaptures).toBe(false);
    expect(failed.passed).toBe(false);
  });
});
