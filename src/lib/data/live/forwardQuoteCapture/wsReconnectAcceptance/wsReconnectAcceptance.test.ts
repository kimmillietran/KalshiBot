import { describe, expect, it } from "vitest";

import { evaluateWsReconnectAcceptance } from "./evaluateWsReconnectAcceptance";
import { runWsReconnectAcceptance } from "./runWsReconnectAcceptance";
import type { WsReconnectAcceptanceObserved } from "./wsReconnectAcceptanceTypes";

function baseObserved(
  overrides: Partial<WsReconnectAcceptanceObserved> = {},
): WsReconnectAcceptanceObserved {
  return {
    runId: "run-reconnect-acceptance",
    runDir: "in-memory/reconnect-acceptance/forward-quotes/run-reconnect-acceptance",
    scenario: "reconnect-success",
    connectionAttemptCount: 2,
    authHeaderGenerationCount: 2,
    authAttemptIdentities: [
      {
        timestamp: "1000",
        signatureHashPrefix: "aaaaaaaaaaaaaaaa",
        signatureLast4: "sig1",
      },
      {
        timestamp: "2000",
        signatureHashPrefix: "bbbbbbbbbbbbbbbb",
        signatureLast4: "sig2",
      },
    ],
    authAttemptsDistinct: true,
    reconnectCount: 1,
    wsRecoverySuccessCount: 1,
    wsRecoveryFailureCount: 0,
    terminalWebSocketFailure: false,
    captureEndReason: "duration-complete",
    runStatusState: "completed",
    healthVerdict: "capture-mvp-success",
    healthErrors: [],
    lockReleased: true,
    streamsDrained: true,
    noCredentialLeakArtifacts: true,
    credentialLeakArtifacts: [],
    processSafety: {
      uncaughtExceptionCount: 0,
      unhandledRejectionCount: 0,
    },
    ...overrides,
  };
}

describe("runWsReconnectAcceptance (deterministic reconnect gate)", () => {
  it("A: proves reconnect-success with fresh headers and process safety", async () => {
    const report = await runWsReconnectAcceptance({
      scenario: "reconnect-success",
    });

    expect(report.failures).toEqual([]);
    expect(report.passed).toBe(true);
    expect(report.observed.authHeaderGenerationCount).toBeGreaterThanOrEqual(2);
    expect(report.observed.connectionAttemptCount).toBeGreaterThanOrEqual(2);
    expect(report.observed.authAttemptsDistinct).toBe(true);
    expect(report.observed.reconnectCount).toBeGreaterThanOrEqual(1);
    expect(report.observed.wsRecoverySuccessCount).toBeGreaterThanOrEqual(1);
    expect(report.observed.terminalWebSocketFailure).toBe(false);
    expect(report.observed.captureEndReason).toBe("duration-complete");
    expect(report.observed.healthVerdict).toBe("capture-mvp-success");
    expect(report.observed.healthErrors).toEqual([]);
    expect(report.observed.lockReleased).toBe(true);
    expect(report.observed.streamsDrained).toBe(true);
    expect(report.observed.noCredentialLeakArtifacts).toBe(true);
    expect(report.observed.processSafety.uncaughtExceptionCount).toBe(0);
    expect(report.observed.processSafety.unhandledRejectionCount).toBe(0);

    const transcript = report.transcript.join("\n");
    expect(transcript).toContain("fresh auth headers");
    expect(transcript).toContain("advanced wall clock");
    expect(transcript).toContain("post-reconnect");
  }, 45_000);

  it("B: proves reconnect-401-terminal is contained without unhandledRejection", async () => {
    const report = await runWsReconnectAcceptance({
      scenario: "reconnect-401-terminal",
    });

    expect(report.failures).toEqual([]);
    expect(report.passed).toBe(true);
    expect(report.observed.authHeaderGenerationCount).toBeGreaterThanOrEqual(2);
    expect(report.observed.reconnectCount).toBeGreaterThanOrEqual(1);
    expect(report.observed.wsRecoveryFailureCount).toBeGreaterThanOrEqual(1);
    expect(report.observed.terminalWebSocketFailure).toBe(true);
    expect(report.observed.captureEndReason).toBe("terminal-websocket-failure");
    expect(report.observed.runStatusState).toBe("failed");
    expect(report.observed.healthVerdict).not.toBe("capture-mvp-success");
    expect(report.observed.lockReleased).toBe(true);
    expect(report.observed.streamsDrained).toBe(true);
    expect(report.observed.processSafety.uncaughtExceptionCount).toBe(0);
    expect(report.observed.processSafety.unhandledRejectionCount).toBe(0);
    expect(
      report.observed.healthErrors.some((error) => error.includes("401")),
    ).toBe(true);

    const transcript = report.transcript.join("\n");
    expect(transcript).toContain("HTTP 401");
  }, 45_000);
});

describe("evaluateWsReconnectAcceptance (pure policy)", () => {
  it("passes a conforming reconnect-success observation", () => {
    const evaluation = evaluateWsReconnectAcceptance(baseObserved());
    expect(evaluation.failures).toEqual([]);
    expect(evaluation.passed).toBe(true);
  });

  it("fails reconnect-success when auth headers were not regenerated", () => {
    const failed = evaluateWsReconnectAcceptance(
      baseObserved({ authHeaderGenerationCount: 1 }),
    )
      .checks.filter((check) => !check.passed)
      .map((check) => check.id);
    expect(failed).toContain("auth-header-generation-count");
  });

  it("fails when an unhandledRejection was observed", () => {
    const failed = evaluateWsReconnectAcceptance(
      baseObserved({
        processSafety: {
          uncaughtExceptionCount: 0,
          unhandledRejectionCount: 1,
        },
      }),
    )
      .checks.filter((check) => !check.passed)
      .map((check) => check.id);
    expect(failed).toContain("process-safety-unhandled-rejection");
  });

  it("passes a conforming reconnect-401-terminal observation", () => {
    const evaluation = evaluateWsReconnectAcceptance(
      baseObserved({
        scenario: "reconnect-401-terminal",
        wsRecoverySuccessCount: 0,
        wsRecoveryFailureCount: 1,
        terminalWebSocketFailure: true,
        captureEndReason: "terminal-websocket-failure",
        runStatusState: "failed",
        healthVerdict: "degraded-capture",
        healthErrors: ["WebSocket recovery connection failed: HTTP 401 Unauthorized"],
      }),
    );
    expect(evaluation.failures).toEqual([]);
    expect(evaluation.passed).toBe(true);
  });
});
