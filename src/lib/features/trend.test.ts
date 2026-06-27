import { describe, expect, it } from "vitest";

import type { FeatureCandle } from "./types";
import { trendStrength } from "./trend";

function candle(index: number, close: number): FeatureCandle {
  return {
    timestamp: index * 60_000,
    open: close - 1,
    high: close + 1,
    low: close - 1,
    close,
  };
}

describe("trendStrength", () => {
  it("returns neutral for insufficient candles", () => {
    expect(trendStrength([])).toEqual({
      score: 0,
      direction: "neutral",
      slopePerBar: 0,
    });
  });

  it("detects bullish trend in rising market", () => {
    const rising = [candle(0, 100), candle(1, 102), candle(2, 105), candle(3, 109)];
    expect(trendStrength(rising).direction).toBe("bullish");
    expect(trendStrength(rising).score).toBeGreaterThan(0);
  });

  it("detects bearish trend in falling market", () => {
    const falling = [candle(0, 109), candle(1, 105), candle(2, 102), candle(3, 100)];
    expect(trendStrength(falling).direction).toBe("bearish");
    expect(trendStrength(falling).score).toBeLessThan(0);
  });

  it("returns neutral for flat market", () => {
    const flat = [candle(0, 100), candle(1, 100), candle(2, 100)];
    expect(trendStrength(flat).direction).toBe("neutral");
  });
});
