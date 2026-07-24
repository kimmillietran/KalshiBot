import { describe, expect, it } from "vitest";

import { evaluateReconnectSmokeAcceptance } from "./evaluateReconnectSmokeAcceptance";
import type { ReconnectSmokeAcceptanceInput } from "./reconnectSmokeAcceptanceTypes";
import { RECONNECT_SMOKE_ACCEPTANCE_SCHEMA_VERSION } from "./reconnectSmokeAcceptanceTypes";

function lifecycleForControlled(cycleId = 7): string {
  return [
    JSON.stringify({
      runId: "run-abc",
      type: "controlledReconnectRequested",
      detectedAt: "2026-07-22T00:00:10.000Z",
      recoveryCycleId: cycleId,
      recoveryReason: "controlled-reconnect-validation",
      requestDisposition: "started",
      socketGeneration: 1,
    }),
    JSON.stringify({
      runId: "run-abc",
      type: "wsRecoveryAttempted",
      detectedAt: "2026-07-22T00:00:11.000Z",
      recoveryCycleId: cycleId,
      recoveryReason: "controlled-reconnect-validation",
      reason: "controlled-reconnect-validation",
      attemptNumber: 1,
      socketGeneration: 2,
    }),
    JSON.stringify({
      runId: "run-abc",
      type: "wsRecoverySucceeded",
      detectedAt: "2026-07-22T00:00:12.000Z",
      recoveryCycleId: cycleId,
      recoveryReason: "controlled-reconnect-validation",
      attemptNumber: 1,
      socketGeneration: 2,
    }),
  ].join("\n");
}

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
      startedAt: "2026-07-22T00:00:00.000Z",
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
      selectedRunId: "run-abc",
      summary: { verdict: "capture-research-ready" },
    },
    lifecycleJsonl: lifecycleForControlled(),
    ...overrides,
  };
}

describe("evaluateReconnectSmokeAcceptance", () => {
  it("passes a conforming exact-run reconnect smoke observation", () => {
    const summary = evaluateReconnectSmokeAcceptance(baseInput());
    expect(summary.passed).toBe(true);
    expect(summary.failedChecks).toEqual([]);
    expect(summary.controlledReconnectProven).toBe(true);
    expect(summary.controlledReconnectRecoveryCycleId).toBe(7);
    expect(summary.auditSelectedRunId).toBe("run-abc");
  });

  it("fails when only a natural recovery occurred (no controlled lifecycle)", () => {
    const naturalOnly = [
      JSON.stringify({
        runId: "run-abc",
        type: "wsRecoveryAttempted",
        detectedAt: "2026-07-22T00:00:11.000Z",
        recoveryCycleId: 3,
        recoveryReason: "application-stream-stall",
        reason: "application-stream-stall",
      }),
      JSON.stringify({
        runId: "run-abc",
        type: "wsRecoverySucceeded",
        detectedAt: "2026-07-22T00:00:12.000Z",
        recoveryCycleId: 3,
        recoveryReason: "application-stream-stall",
      }),
    ].join("\n");
    const summary = evaluateReconnectSmokeAcceptance(
      baseInput({ lifecycleJsonl: naturalOnly }),
    );
    expect(summary.passed).toBe(false);
    expect(summary.controlledReconnectProven).toBe(false);
    expect(
      summary.failedChecks.some((check) =>
        check.includes("controlledReconnectRequestCount"),
      ),
    ).toBe(true);
  });

  it("fails when controlled request is followed by a mismatched natural success", () => {
    const mismatched = [
      JSON.stringify({
        runId: "run-abc",
        type: "controlledReconnectRequested",
        detectedAt: "2026-07-22T00:00:10.000Z",
        recoveryCycleId: 7,
        recoveryReason: "controlled-reconnect-validation",
        requestDisposition: "started",
      }),
      JSON.stringify({
        runId: "run-abc",
        type: "wsRecoveryAttempted",
        detectedAt: "2026-07-22T00:00:11.000Z",
        recoveryCycleId: 8,
        recoveryReason: "application-stream-stall",
      }),
      JSON.stringify({
        runId: "run-abc",
        type: "wsRecoverySucceeded",
        detectedAt: "2026-07-22T00:00:12.000Z",
        recoveryCycleId: 8,
        recoveryReason: "application-stream-stall",
      }),
    ].join("\n");
    const summary = evaluateReconnectSmokeAcceptance(
      baseInput({ lifecycleJsonl: mismatched }),
    );
    expect(summary.passed).toBe(false);
    expect(summary.controlledReconnectProven).toBe(false);
  });

  it("fails on audit selectedRunId mismatch or missing", () => {
    expect(
      evaluateReconnectSmokeAcceptance(
        baseInput({
          audit: {
            selectedRunId: "other",
            summary: { verdict: "capture-research-ready" },
          },
        }),
      ).failedChecks.some((check) => check.includes("audit.selectedRunId-mismatch")),
    ).toBe(true);

    expect(
      evaluateReconnectSmokeAcceptance(
        baseInput({
          audit: { summary: { verdict: "capture-research-ready" } },
        }),
      ).failedChecks.some((check) => check.includes("audit.selectedRunId-missing")),
    ).toBe(true);
  });

  it("fails on missing or mismatched health.runId", () => {
    expect(
      evaluateReconnectSmokeAcceptance(
        baseInput({
          health: {
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
            writer: { allStreamsDrained: true, failure: null },
          },
        }),
      ).failedChecks,
    ).toContain("health.runId-missing");

    expect(
      evaluateReconnectSmokeAcceptance(
        baseInput({
          health: {
            runId: "other",
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
            writer: { allStreamsDrained: true, failure: null },
          },
        }),
      ).failedChecks.some((check) => check.includes("health.runId-mismatch")),
    ).toBe(true);
  });

  it("rejects fractional counters and invalid endedAt chronology", () => {
    expect(
      evaluateReconnectSmokeAcceptance(
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
              reconnectCount: 1.5,
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
      ).failedChecks.some((check) => check.includes("reconnectCount")),
    ).toBe(true);

    expect(
      evaluateReconnectSmokeAcceptance(
        baseInput({
          status: {
            schemaVersion: 1,
            runId: "run-abc",
            state: "completed",
            startedAt: "2026-07-22T00:20:00.000Z",
            endedAt: "2026-07-22T00:00:00.000Z",
            captureEndReason: "duration-complete",
            failureReason: null,
          },
        }),
      ).failedChecks,
    ).toContain("status.endedAt-before-startedAt");
  });

  it("rejects runDir basename mismatch", () => {
    expect(
      evaluateReconnectSmokeAcceptance(
        baseInput({ runDir: "data/live-capture/forward-quotes/other" }),
      ).failedChecks.some((check) => check.includes("runDir-basename-mismatch")),
    ).toBe(true);
  });

  it("fails closed on malformed lifecycle JSON", () => {
    const summary = evaluateReconnectSmokeAcceptance(
      baseInput({ lifecycleJsonl: "{not-json" }),
    );
    expect(summary.passed).toBe(false);
    expect(
      summary.failedChecks.some((check) => check.includes("lifecycle-malformed")),
    ).toBe(true);
  });
});
