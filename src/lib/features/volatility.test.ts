import { describe, expect, it } from "vitest";

import type { FeatureCandle } from "./types";
import { rollingVolatility } from "./volatility";

function candle(index: number, close: number): FeatureCandle {
  return {
    timestamp: index * 60_000,
    open: close,
    high: close,
    low: close,
    close,
  };
}

describe("rollingVolatility", () => {
  it("returns zero for empty candles", () => {
    expect(rollingVolatility([])).toEqual({
      stdDev: 0,
      coefficientOfVariation: 0,
      bars: 0,
    });
  });

  it("returns zero std dev for single candle", () => {
    expect(rollingVolatility([candle(0, 100)]).stdDev).toBe(0);
  });

  it("returns zero volatility for flat market", () => {
    const flat = [candle(0, 100), candle(1, 100), candle(2, 100)];
    expect(rollingVolatility(flat).stdDev).toBe(0);
  });

  it("returns higher volatility for choppy market", () => {
    const choppy = [candle(0, 100), candle(1, 110), candle(2, 95), candle(3, 105)];
    const flat = [candle(0, 100), candle(1, 100), candle(2, 100), candle(3, 100)];
    expect(rollingVolatility(choppy).stdDev).toBeGreaterThan(
      rollingVolatility(flat).stdDev,
    );
  });
});
