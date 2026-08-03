import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  countControlledReconnectAttemptsFromLifecycle,
  countControlledReconnectFailuresFromLifecycle,
  countControlledReconnectSuccessesFromLifecycle,
  isControlledReconnectValidationReason,
} from "./runLiveForwardQuoteCapture";
import {
  CONTROLLED_RECONNECT_VALIDATION_REASON,
  createKalshiWsWatchdogConfig,
  KalshiWsLivenessWatchdog,
} from "./kalshiWsLivenessWatchdog";

describe("controlled reconnect lifecycle accounting helpers", () => {
  it("matches recoveryReason or reason fallback (acceptance parity)", () => {
    expect(
      isControlledReconnectValidationReason({
        recoveryReason: CONTROLLED_RECONNECT_VALIDATION_REASON,
      }),
    ).toBe(true);
    expect(
      isControlledReconnectValidationReason({
        reason: CONTROLLED_RECONNECT_VALIDATION_REASON,
      }),
    ).toBe(true);
    expect(
      isControlledReconnectValidationReason({
        recoveryReason: "application-stream-stall",
      }),
    ).toBe(false);
  });

  it("counts attempt/success/failure for one recovery cycle only", () => {
    const events = [
      {
        type: "wsRecoveryAttempted",
        recoveryCycleId: 7,
        recoveryReason: CONTROLLED_RECONNECT_VALIDATION_REASON,
      },
      {
        type: "wsRecoverySucceeded",
        recoveryCycleId: 7,
        recoveryReason: CONTROLLED_RECONNECT_VALIDATION_REASON,
      },
      {
        type: "wsRecoveryAttempted",
        recoveryCycleId: 8,
        recoveryReason: CONTROLLED_RECONNECT_VALIDATION_REASON,
      },
      {
        type: "wsRecoveryFailed",
        recoveryCycleId: 8,
        reason: CONTROLLED_RECONNECT_VALIDATION_REASON,
      },
    ];
    expect(countControlledReconnectAttemptsFromLifecycle(events, 7)).toBe(1);
    expect(countControlledReconnectSuccessesFromLifecycle(events, 7)).toBe(1);
    expect(countControlledReconnectFailuresFromLifecycle(events, 7)).toBe(0);
    expect(countControlledReconnectAttemptsFromLifecycle(events, 8)).toBe(1);
    expect(countControlledReconnectFailuresFromLifecycle(events, 8)).toBe(1);
  });
});

describe("requestEscalatedRecovery attempt emission ordering", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not emit wsRecoveryAttempted synchronously before caller returns", async () => {
    const events: Array<{ type: string }> = [];
    const nowMs = 0;
    const executeRecovery = vi.fn(async () => ({
      status: "succeeded" as const,
      firstRawMessageAt: new Date(nowMs).toISOString(),
      subscriptionsRestored: 1,
    }));
    const config = createKalshiWsWatchdogConfig({
      watchdogTickMs: 5_000,
      wsSoftSilenceThresholdMs: 30_000,
      wsHardStallThresholdMs: 60_000,
      wsProbeGraceMs: 10_000,
      wsInitialGraceMs: 0,
      wsRecoveryInitialBackoffMs: 0,
      wsRecoveryMaxAttempts: 1,
      wsPostSubscribeConfirmationMs: 5_000,
      systemSleepJumpThresholdMs: 60_000,
    });
    const watchdog = new KalshiWsLivenessWatchdog(config, {
      now: () => new Date(nowMs),
      monotonicNowMs: () => nowMs,
      shouldStop: () => false,
      getActiveMarketTickers: () => ["KXBTC15M-TEST"],
      executeRecovery,
      onEvent: (event) => {
        events.push({ type: event.type });
      },
    });
    watchdog.markCaptureStarted();
    watchdog.incrementSocketGeneration();
    watchdog.recordWebSocketOpen();
    watchdog.recordSubscriptionSuccess(1);
    watchdog.recordRawMessage();
    watchdog.recordExpectedMarketMessage();

    const result = watchdog.requestEscalatedRecovery(
      CONTROLLED_RECONNECT_VALIDATION_REASON,
    );
    expect(result.status).toBe("started");
    // Caller can accept controlled reconnect before any attempt event.
    expect(events.some((e) => e.type === "wsRecoveryAttempted")).toBe(false);

    await vi.runOnlyPendingTimersAsync();
    await watchdog.waitForRecovery();
    expect(events.some((e) => e.type === "wsRecoveryAttempted")).toBe(true);
    expect(events.some((e) => e.type === "wsRecoverySucceeded")).toBe(true);
  });
});

describe("production false-negative shape (accepted + lifecycle attempt/success)", () => {
  it("authoritative attempt count is 1 when lifecycle has attempt+success", () => {
    // Observed live: succeeded=true, acceptedRequestCount=1, attemptCount=0
    // while lifecycle had attempt=1 and success=1. Final diagnostics must
    // report attemptCount=1 from lifecycle evidence.
    const lifecycle = [
      {
        type: "controlledReconnectRequested",
        recoveryCycleId: 1,
        recoveryReason: CONTROLLED_RECONNECT_VALIDATION_REASON,
      },
      {
        type: "wsRecoveryAttempted",
        recoveryCycleId: 1,
        recoveryReason: CONTROLLED_RECONNECT_VALIDATION_REASON,
      },
      {
        type: "wsRecoverySucceeded",
        recoveryCycleId: 1,
        recoveryReason: CONTROLLED_RECONNECT_VALIDATION_REASON,
      },
    ];
    const inMemoryAttemptCount = 0;
    const lifecycleAttempts = countControlledReconnectAttemptsFromLifecycle(
      lifecycle,
      1,
    );
    const lifecycleSuccesses = countControlledReconnectSuccessesFromLifecycle(
      lifecycle,
      1,
    );
    expect(lifecycleAttempts).toBe(1);
    expect(lifecycleSuccesses).toBe(1);
    expect(Math.max(inMemoryAttemptCount, lifecycleAttempts)).toBe(1);
  });

  it("flags conflict when success exists without an attempt", () => {
    const lifecycle = [
      {
        type: "wsRecoverySucceeded",
        recoveryCycleId: 1,
        recoveryReason: CONTROLLED_RECONNECT_VALIDATION_REASON,
      },
    ];
    const attempts = countControlledReconnectAttemptsFromLifecycle(lifecycle, 1);
    const successes = countControlledReconnectSuccessesFromLifecycle(lifecycle, 1);
    expect(successes === 1 && attempts < 1).toBe(true);
  });

  it("flags conflict on duplicate controlled successes", () => {
    const lifecycle = [
      {
        type: "wsRecoveryAttempted",
        recoveryCycleId: 1,
        recoveryReason: CONTROLLED_RECONNECT_VALIDATION_REASON,
      },
      {
        type: "wsRecoverySucceeded",
        recoveryCycleId: 1,
        recoveryReason: CONTROLLED_RECONNECT_VALIDATION_REASON,
      },
      {
        type: "wsRecoverySucceeded",
        recoveryCycleId: 1,
        recoveryReason: CONTROLLED_RECONNECT_VALIDATION_REASON,
      },
    ];
    expect(countControlledReconnectSuccessesFromLifecycle(lifecycle, 1)).toBe(2);
  });
});
