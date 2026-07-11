import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createKalshiWsWatchdogConfig,
  KalshiWsLivenessWatchdog,
} from "./index";
import type { KalshiWsRecoveryExecutor } from "./kalshiWsWatchdogTypes";

describe("KalshiWsLivenessWatchdog", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function createWatchdog(input?: {
    executeRecovery?: KalshiWsRecoveryExecutor;
    sendProbe?: () => void;
    activeTickers?: string[];
  }) {
    let nowMs = 0;
    const config = createKalshiWsWatchdogConfig({
      watchdogTickMs: 5_000,
      wsSoftSilenceThresholdMs: 30_000,
      wsHardStallThresholdMs: 60_000,
      wsProbeGraceMs: 10_000,
      wsInitialGraceMs: 0,
      wsRecoveryInitialBackoffMs: 0,
      wsRecoveryMaxAttempts: 2,
      wsPostSubscribeConfirmationMs: 5_000,
      systemSleepJumpThresholdMs: 60_000,
    });

    const executeRecovery =
      input?.executeRecovery
      ?? vi.fn(async () => ({
        status: "succeeded" as const,
        firstRawMessageAt: new Date(nowMs).toISOString(),
        subscriptionsRestored: 1,
      }));

    const watchdog = new KalshiWsLivenessWatchdog(config, {
      now: () => new Date(nowMs),
      monotonicNowMs: () => nowMs,
      shouldStop: () => false,
      getActiveMarketTickers: () => input?.activeTickers ?? ["KXBTC15M-TEST"],
      sendProbe: input?.sendProbe,
      executeRecovery,
    });

    watchdog.markCaptureStarted();
    watchdog.incrementSocketGeneration();
    watchdog.recordWebSocketOpen();
    watchdog.recordSubscriptionSuccess(1);
    watchdog.recordRawMessage();
    watchdog.recordExpectedMarketMessage();
    nowMs += 5_000;

    return {
      watchdog,
      executeRecovery,
      advance: (ms: number) => {
        nowMs += ms;
      },
      async runTick() {
        const pending = watchdog.tick();
        await vi.runOnlyPendingTimersAsync();
        await pending;
        await watchdog.waitForRecovery();
        await vi.runOnlyPendingTimersAsync();
      },
    };
  }

  it("does not trigger recovery for silence below soft threshold", async () => {
    const { watchdog, executeRecovery, advance, runTick } = createWatchdog();
    advance(20_000);
    await runTick();
    expect(executeRecovery).not.toHaveBeenCalled();
    expect(watchdog.toDiagnostics().wsStallDetectedCount).toBe(0);
  });

  it("sends a probe during soft silence and waits for expected market data", async () => {
    const sendProbe = vi.fn();
    const { watchdog, advance, runTick } = createWatchdog({ sendProbe });
    advance(35_000);
    await runTick();
    expect(sendProbe).toHaveBeenCalledTimes(1);
    watchdog.recordRawMessage();
    advance(5_000);
    await runTick();
    expect(watchdog.toDiagnostics().state).toBe("probing");
    watchdog.recordExpectedMarketMessage();
    await runTick();
    expect(watchdog.toDiagnostics().state).toBe("healthy");
  });

  it("triggers single-flight recovery after hard silence", async () => {
    const executeRecovery = vi.fn(async () => ({
      status: "succeeded" as const,
      firstRawMessageAt: "2026-07-11T06:00:00.000Z",
      subscriptionsRestored: 2,
    }));
    const { watchdog, advance, runTick } = createWatchdog({ executeRecovery });
    advance(65_000);
    await runTick();
    expect(executeRecovery).toHaveBeenCalledTimes(1);
    expect(watchdog.toDiagnostics().wsRecoverySuccessCount).toBe(1);
  });

  it("emits suspectedSystemSleep and starts one recovery on timer jump", async () => {
    const executeRecovery = vi.fn(async () => ({
      status: "succeeded" as const,
      firstRawMessageAt: "2026-07-11T05:46:18.565Z",
      subscriptionsRestored: 1,
    }));
    const { watchdog, advance, runTick } = createWatchdog({ executeRecovery });
    advance(1_440_000);
    await runTick();
    expect(
      watchdog.toDiagnostics().lifecycleEvents.some(
        (event) => event.type === "suspectedSystemSleep",
      ),
    ).toBe(true);
    expect(executeRecovery).toHaveBeenCalledTimes(1);
    expect(watchdog.toDiagnostics().postResumeRecoveryCount).toBe(1);
  });

  it("enters terminal failure after exhausted recovery attempts", async () => {
    const executeRecovery = vi.fn(async () => ({
      status: "failed" as const,
      reason: "no-application-messages-after-recovery",
    }));
    let nowMs = 0;
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
    });
    watchdog.markCaptureStarted();
    watchdog.incrementSocketGeneration();
    watchdog.recordWebSocketOpen();
    watchdog.recordSubscriptionSuccess(1);
    watchdog.recordRawMessage();
    watchdog.recordExpectedMarketMessage();
    nowMs += 65_000;
    const pending = watchdog.tick();
    await vi.runOnlyPendingTimersAsync();
    await pending;
    await watchdog.waitForRecovery();
    expect(watchdog.isTerminal).toBe(true);
    expect(watchdog.toDiagnostics().terminalWebSocketFailure).toBe(true);
    expect(watchdog.toDiagnostics().wsRecoveryFailureCount).toBe(1);
  }, 15_000);

  it("tracks kalshi silence while BTC remains active", async () => {
    const { watchdog, advance, runTick } = createWatchdog();
    advance(35_000);
    watchdog.recordBtcActivity();
    await runTick();
    advance(10_000);
    watchdog.recordBtcActivity();
    await runTick();
    expect(watchdog.toDiagnostics().kalshiSilentWhileBtcActiveSeconds).toBeGreaterThan(0);
  });
});
