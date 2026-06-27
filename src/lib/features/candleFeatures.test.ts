import { describe, expect, it } from "vitest";

import type { FeatureCandle } from "./types";
import { higherHighs, higherLows, lastCandleDirection } from "./candleFeatures";

function candle(index: number, close: number, open = close): FeatureCandle {
  return {
    timestamp: index * 60_000,
    open,
    high: Math.max(open, close) + 1,
    low: Math.min(open, close) - 1,
    close,
  };
}

describe("candleFeatures", () => {
  it("returns null direction for empty candles", () => {
    expect(lastCandleDirection([])).toEqual({ direction: null, change: 0 });
  });

  it("detects last candle direction", () => {
    expect(lastCandleDirection([candle(0, 100, 95)])).toEqual({
      direction: "up",
      change: 5,
    });
    expect(lastCandleDirection([candle(0, 95, 100)])).toEqual({
      direction: "down",
      change: -5,
    });
    expect(lastCandleDirection([candle(0, 100, 100)])).toEqual({
      direction: "flat",
      change: 0,
    });
  });

  it("counts higher highs in rising market", () => {
    const rising = [candle(0, 100), candle(1, 102), candle(2, 104), candle(3, 106)];
    expect(higherHighs(rising).isRising).toBe(true);
    expect(higherHighs(rising).streak).toBeGreaterThanOrEqual(2);
  });

  it("returns zero streak for flat market", () => {
    const flat = [candle(0, 100), candle(1, 100), candle(2, 100)];
    expect(higherHighs(flat).streak).toBe(0);
    expect(higherLows(flat).streak).toBe(0);
  });

  it("counts higher lows in rising market", () => {
    const rising = [
      { ...candle(0, 100), low: 98 },
      { ...candle(1, 102), low: 100 },
      { ...candle(2, 104), low: 101 },
      { ...candle(3, 106), low: 103 },
    ];
    expect(higherLows(rising).isRising).toBe(true);
  });

  it("handles single candle for structure features", () => {
    expect(higherHighs([candle(0, 100)]).streak).toBe(0);
    expect(higherLows([candle(0, 100)]).streak).toBe(0);
  });
});
