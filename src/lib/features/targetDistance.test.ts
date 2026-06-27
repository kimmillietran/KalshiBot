import { describe, expect, it } from "vitest";

import type { FeatureCandle } from "./types";
import {
  crossedTargetRecently,
  distanceToTarget,
  percentAboveTarget,
  percentToTarget,
} from "./targetDistance";

const BASE = 1_700_000_000_000;

function candle(
  index: number,
  close: number,
  open = close - 10,
): FeatureCandle {
  return {
    timestamp: BASE + index * 60_000,
    open,
    high: Math.max(open, close) + 5,
    low: Math.min(open, close) - 5,
    close,
  };
}

describe("targetDistance", () => {
  it("computes absolute and signed distance", () => {
    expect(distanceToTarget(64_250, 64_225)).toEqual({
      absolute: 25,
      signed: 25,
      isAboveTarget: true,
    });
  });

  it("handles negative distance below target", () => {
    const result = distanceToTarget(64_200, 64_225);
    expect(result.signed).toBe(-25);
    expect(result.isAboveTarget).toBe(false);
  });

  it("computes percent above target", () => {
    expect(percentAboveTarget(64_250, 64_225).percent).toBeCloseTo(0.0389, 3);
    expect(percentToTarget(64_200, 64_225).percent).toBeLessThan(0);
  });

  it("detects recent upward target cross", () => {
    const candles = [
      candle(0, 64_200),
      candle(1, 64_210),
      candle(2, 64_230),
    ];

    expect(crossedTargetRecently(candles, 64_225)).toEqual({
      crossed: true,
      direction: "up",
      barsAgo: 0,
    });
  });

  it("detects target already crossed earlier in lookback", () => {
    const candles = [
      candle(0, 64_200),
      candle(1, 64_230),
      candle(2, 64_240),
    ];

    expect(crossedTargetRecently(candles, 64_225, 3)).toEqual({
      crossed: true,
      direction: "up",
      barsAgo: 1,
    });
  });

  it("returns false when target not crossed", () => {
    const candles = [candle(0, 64_200), candle(1, 64_210)];
    expect(crossedTargetRecently(candles, 64_225)).toEqual({
      crossed: false,
      direction: null,
      barsAgo: null,
    });
  });
});
