import { describe, expect, it } from "vitest";

import {
  AdaptiveThrottleController,
  formatBatchImportProgressLine,
  parseBatchImportAdaptiveThrottleOptions,
} from "./batchImportAdaptiveThrottle";
import { BatchImportRunnerError } from "./batchImportTypes";

describe("parseBatchImportAdaptiveThrottleOptions", () => {
  it("defaults adaptive mode to disabled", () => {
    expect(parseBatchImportAdaptiveThrottleOptions()).toEqual({
      enabled: false,
      minRequestDelayMs: 100,
      maxRequestDelayMs: 3000,
      throttleIncreaseFactor: 2,
      throttleDecreaseMs: 50,
    });
  });

  it("parses adaptive throttle settings", () => {
    expect(
      parseBatchImportAdaptiveThrottleOptions({
        adaptiveThrottle: true,
        minRequestDelayMs: 150,
        maxRequestDelayMs: 2500,
        throttleIncreaseFactor: 3,
        throttleDecreaseMs: 25,
      }),
    ).toEqual({
      enabled: true,
      minRequestDelayMs: 150,
      maxRequestDelayMs: 2500,
      throttleIncreaseFactor: 3,
      throttleDecreaseMs: 25,
    });
  });

  it("rejects invalid min/max relationships", () => {
    expect(() =>
      parseBatchImportAdaptiveThrottleOptions({
        adaptiveThrottle: true,
        minRequestDelayMs: 500,
        maxRequestDelayMs: 100,
      }),
    ).toThrow(BatchImportRunnerError);
  });
});

describe("AdaptiveThrottleController", () => {
  it("starts at the minimum delay", () => {
    const controller = new AdaptiveThrottleController({
      enabled: true,
      minRequestDelayMs: 100,
      maxRequestDelayMs: 3000,
      throttleIncreaseFactor: 2,
      throttleDecreaseMs: 50,
    });

    expect(controller.currentDelayMs).toBe(100);
    expect(controller.getMetrics().initialRequestDelayMs).toBe(100);
  });

  it("decreases delay toward the minimum after clean successes", () => {
    const controller = new AdaptiveThrottleController({
      enabled: true,
      minRequestDelayMs: 100,
      maxRequestDelayMs: 3000,
      throttleIncreaseFactor: 2,
      throttleDecreaseMs: 50,
    });

    controller.currentDelayMs = 250;
    controller.onSuccessWithoutRateLimit();

    expect(controller.currentDelayMs).toBe(200);
    controller.onSuccessWithoutRateLimit();
    expect(controller.currentDelayMs).toBe(150);
    controller.onSuccessWithoutRateLimit();
    expect(controller.currentDelayMs).toBe(100);
    controller.onSuccessWithoutRateLimit();
    expect(controller.currentDelayMs).toBe(100);
  });

  it("increases delay on rate limits and never exceeds the maximum", () => {
    const controller = new AdaptiveThrottleController({
      enabled: true,
      minRequestDelayMs: 100,
      maxRequestDelayMs: 300,
      throttleIncreaseFactor: 2,
      throttleDecreaseMs: 50,
    });

    controller.onRateLimit();
    expect(controller.currentDelayMs).toBe(200);
    controller.onRateLimit();
    expect(controller.currentDelayMs).toBe(300);
    controller.onRateLimit();
    expect(controller.currentDelayMs).toBe(300);
    expect(controller.getMetrics().rateLimitCount).toBe(3);
  });

  it("tracks average applied delay samples", () => {
    const controller = new AdaptiveThrottleController({
      enabled: true,
      minRequestDelayMs: 100,
      maxRequestDelayMs: 3000,
      throttleIncreaseFactor: 2,
      throttleDecreaseMs: 50,
    });

    controller.recordAppliedDelay(100);
    controller.recordAppliedDelay(200);

    expect(controller.getMetrics().averageRequestDelayMs).toBe(150);
  });
});

describe("formatBatchImportProgressLine", () => {
  it("formats stderr progress lines", () => {
    expect(
      formatBatchImportProgressLine({
        marketIndex: 13,
        totalMarkets: 500,
        marketTicker: "KXBTC15M-MARKET-13",
        status: "rate-limited",
        delayMs: 750,
        retries: 1,
      }),
    ).toBe(
      "[import] market=13/500 ticker=KXBTC15M-MARKET-13 status=rate-limited delayMs=750 retries=1",
    );
  });
});
