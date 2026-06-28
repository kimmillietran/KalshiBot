import { describe, expect, it } from "vitest";

import {
  applyPollIntervalJitter,
  DEFAULT_POLLING_RATE_GOVERNOR_CONFIG,
  PollingRateGovernor,
  validatePollingRateGovernorConfig,
} from "./PollingRateGovernor";
import { intervalMsForPriority } from "./priority";
import { PollingRateGovernorConfigError } from "./errors";

const BASE_CONFIG = {
  ...DEFAULT_POLLING_RATE_GOVERNOR_CONFIG,
  minIntervalMs: 10_000,
  maxIntervalMs: 20_000,
  tokenBudget: 2,
  tokenBudgetWindowMs: 60_000,
  jitterFraction: 0.1,
  staleQuoteThresholdMs: 30_000,
};

describe("intervalMsForPriority", () => {
  it("maps higher priority to shorter intervals within min/max bounds", () => {
    expect(intervalMsForPriority("critical", 10_000, 20_000)).toBe(10_000);
    expect(intervalMsForPriority("high", 10_000, 20_000)).toBe(12_500);
    expect(intervalMsForPriority("normal", 10_000, 20_000)).toBe(15_000);
    expect(intervalMsForPriority("low", 10_000, 20_000)).toBe(17_500);
  });
});

describe("applyPollIntervalJitter", () => {
  it("applies deterministic jitter from an injected sample", () => {
    expect(applyPollIntervalJitter(10_000, 0.1, 0)).toBe(9_000);
    expect(applyPollIntervalJitter(10_000, 0.1, 0.5)).toBe(10_000);
    expect(applyPollIntervalJitter(10_000, 0.1, 1)).toBe(11_000);
  });
});

describe("PollingRateGovernor", () => {
  it("validates config bounds", () => {
    expect(() =>
      validatePollingRateGovernorConfig({
        ...BASE_CONFIG,
        minIntervalMs: 25_000,
        maxIntervalMs: 20_000,
      }),
    ).toThrow(PollingRateGovernorConfigError);
  });

  it("assesses poll readiness and schedules the next poll", () => {
    const governor = new PollingRateGovernor(BASE_CONFIG);
    const state = governor.createMarketState("MKT-A", "critical", 0);

    expect(governor.assessPollReadiness(state, 0)).toEqual({
      allowed: true,
      reason: "ready",
      retryAfterMs: null,
    });

    const scheduled = governor.scheduleNextPoll(state, 0, 0.5);
    expect(scheduled.nextPollDueAtMs).toBe(10_000);
    expect(governor.assessPollReadiness(scheduled, 5_000)).toEqual({
      allowed: false,
      reason: "scheduled-wait",
      retryAfterMs: 5_000,
    });
  });

  it("applies exponential backoff after HTTP 429 responses", () => {
    const governor = new PollingRateGovernor({
      ...BASE_CONFIG,
      tokenBudget: 10,
    });
    let state = governor.createMarketState("MKT-A", "normal", 0);

    state = governor.recordRateLimited(state, 0, 0.5);
    expect(state.consecutive429Count).toBe(1);

    const firstBackoff = governor.computeIntervalDecision(state, 0.5);
    expect(firstBackoff.backoffActive).toBe(true);
    expect(firstBackoff.baseIntervalMs).toBe(30_000);

    state = governor.recordRateLimited(state, 30_000, 0.5);
    expect(state.consecutive429Count).toBe(2);

    const secondBackoff = governor.computeIntervalDecision(state, 0.5);
    expect(secondBackoff.baseIntervalMs).toBe(60_000);
  });

  it("resets backoff after a successful poll", () => {
    const governor = new PollingRateGovernor(BASE_CONFIG);
    let state = governor.createMarketState("MKT-A", "normal", 0);
    state = governor.recordRateLimited(state, 0, 0.5);

    state = governor.recordPollSuccess(state, 30_000, 29_500, 0.5);

    expect(state.consecutive429Count).toBe(0);
    expect(state.lastQuoteObservedAtMs).toBe(29_500);
    expect(governor.computeIntervalDecision(state, 0.5).backoffActive).toBe(false);
  });

  it("throttles polling when the token budget is exhausted", () => {
    const governor = new PollingRateGovernor(BASE_CONFIG);
    let state = governor.createMarketState("MKT-A", "critical", 0);

    state = governor.recordPollAttempt(state, 0, 0.5);
    state = governor.recordPollAttempt(state, 0, 0.5);

    const readiness = governor.assessPollReadiness(state, 0);
    expect(readiness.allowed).toBe(false);
    expect(readiness.reason).toBe("token-budget-exhausted");
    expect(readiness.retryAfterMs).toBe(60_000);

    const throttled = governor.computeIntervalDecision(state, 0.5);
    expect(throttled.throttledByBudget).toBe(true);
    expect(throttled.baseIntervalMs).toBeGreaterThan(BASE_CONFIG.maxIntervalMs);
  });

  it("detects stale quotes from observed timestamps", () => {
    const governor = new PollingRateGovernor(BASE_CONFIG);
    const nowMs = 100_000;

    expect(governor.detectStaleQuote(null, nowMs)).toEqual({
      isStale: true,
      ageMs: null,
      thresholdMs: 30_000,
    });

    expect(governor.detectStaleQuote(nowMs - 20_000, nowMs)).toEqual({
      isStale: false,
      ageMs: 20_000,
      thresholdMs: 30_000,
    });

    expect(governor.detectStaleQuote(nowMs - 45_000, nowMs)).toEqual({
      isStale: true,
      ageMs: 45_000,
      thresholdMs: 30_000,
    });
  });

  it("selects the highest-priority ready market", () => {
    const governor = new PollingRateGovernor(BASE_CONFIG);
    const critical = governor.createMarketState("MKT-CRITICAL", "critical", 0);
    const low = governor.createMarketState("MKT-LOW", "low", 0);
    const waiting = governor.scheduleNextPoll(
      governor.createMarketState("MKT-WAIT", "critical", 0),
      0,
      0.5,
    );

    expect(governor.selectNextMarket([low, waiting, critical], 0)?.marketId).toBe(
      "MKT-CRITICAL",
    );
    expect(governor.selectNextMarket([waiting], 0)).toBeNull();
  });

  it("resets token budget after the window expires", () => {
    const governor = new PollingRateGovernor(BASE_CONFIG);
    let state = governor.createMarketState("MKT-A", "critical", 0);
    state = governor.recordPollAttempt(state, 0, 0.5);
    state = governor.recordPollAttempt(state, 0, 0.5);

    const afterWindow = governor.assessPollReadiness(state, 60_001);
    expect(afterWindow.allowed).toBe(true);
    expect(afterWindow.reason).toBe("ready");
  });
});
