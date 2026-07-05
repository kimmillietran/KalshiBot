import { describe, expect, it } from "vitest";

import {
  computeExpansionImportThroughput,
  ExpansionAdaptiveThrottleController,
  parseExpansionImportAdaptiveThrottleOptions,
} from "./expansionImportAdaptiveThrottle";

describe("expansionImportAdaptiveThrottle", () => {
  it("defaults adaptive mode to disabled", () => {
    expect(parseExpansionImportAdaptiveThrottleOptions()).toEqual({
      enabled: false,
      minBackoffMs: 500,
      maxBackoffMs: 30_000,
      backoffMultiplier: 2,
      successDecayAfter: 3,
      throttleDecreaseMs: 250,
    });
  });

  it("parses adaptive throttle settings", () => {
    expect(
      parseExpansionImportAdaptiveThrottleOptions({
        adaptiveThrottle: true,
        minBackoffMs: 250,
        maxBackoffMs: 10_000,
        backoffMultiplier: 3,
        successDecayAfter: 5,
      }),
    ).toEqual({
      enabled: true,
      minBackoffMs: 250,
      maxBackoffMs: 10_000,
      backoffMultiplier: 3,
      successDecayAfter: 5,
      throttleDecreaseMs: 250,
    });
  });

  it("starts at the minimum delay and increases on rate limits", () => {
    const controller = new ExpansionAdaptiveThrottleController({
      enabled: true,
      minBackoffMs: 500,
      maxBackoffMs: 5000,
      backoffMultiplier: 2,
      successDecayAfter: 3,
      throttleDecreaseMs: 250,
    });

    expect(controller.currentDelayMs).toBe(500);
    controller.onRateLimit();
    expect(controller.currentDelayMs).toBe(1000);
    controller.onRateLimit(4000);
    expect(controller.currentDelayMs).toBe(4000);
  });

  it("decreases delay only after sustained clean successes", () => {
    const controller = new ExpansionAdaptiveThrottleController({
      enabled: true,
      minBackoffMs: 500,
      maxBackoffMs: 5000,
      backoffMultiplier: 2,
      successDecayAfter: 3,
      throttleDecreaseMs: 250,
    });

    controller.currentDelayMs = 1500;
    controller.onSuccessfulImport(false);
    controller.onSuccessfulImport(false);
    expect(controller.currentDelayMs).toBe(1500);

    controller.onSuccessfulImport(false);
    expect(controller.currentDelayMs).toBe(1250);
  });

  it("tracks diagnostics including throughput and avoided retry estimate", () => {
    const controller = new ExpansionAdaptiveThrottleController({
      enabled: true,
      minBackoffMs: 500,
      maxBackoffMs: 5000,
      backoffMultiplier: 2,
      successDecayAfter: 2,
      throttleDecreaseMs: 250,
    });

    controller.onRateLimit();
    controller.onSuccessfulImport(false);
    controller.onSuccessfulImport(false);
    controller.recordInterMarketBackoff(1000);

    expect(
      controller.buildDiagnostics({
        durationMs: 60_000,
        rateLimitRetryBackoffMs: 5000,
      }),
    ).toMatchObject({
      adaptiveThrottleEnabled: true,
      minBackoffMs: 500,
      maxBackoffMs: 5000,
      currentDelayMs: 750,
      rateLimitEvents: 1,
      avoidedRetriesEstimate: 2,
      totalBackoffMs: 6000,
      throughputMarketsPerMinute: 2,
    });
  });

  it("computes throughput as markets per minute", () => {
    expect(computeExpansionImportThroughput(10, 120_000)).toBe(5);
    expect(computeExpansionImportThroughput(0, 120_000)).toBeNull();
  });
});
