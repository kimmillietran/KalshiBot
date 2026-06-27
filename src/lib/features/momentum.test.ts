import { describe, expect, it } from "vitest";

import type { FeatureCandle } from "./types";
import { priceAcceleration, priceVelocity, recentMomentum } from "./momentum";

function candle(index: number, close: number): FeatureCandle {
  return {
    timestamp: index * 60_000,
    open: close - 1,
    high: close + 1,
    low: close - 2,
    close,
  };
}

describe("momentum", () => {
  it("returns zero momentum for empty candles", () => {
    expect(recentMomentum([])).toEqual({ change: 0, changePercent: 0, bars: 0 });
  });

  it("computes rising market momentum", () => {
    const rising = [candle(0, 100), candle(1, 102), candle(2, 105)];
    const momentum = recentMomentum(rising);
    expect(momentum.change).toBe(5);
    expect(momentum.changePercent).toBe(5);
  });

  it("computes falling market momentum", () => {
    const falling = [candle(0, 105), candle(1, 102), candle(2, 100)];
    expect(recentMomentum(falling).change).toBe(-5);
  });

  it("returns zero momentum for flat market", () => {
    const flat = [candle(0, 100), candle(1, 100), candle(2, 100)];
    expect(recentMomentum(flat).change).toBe(0);
  });

  it("computes price velocity per bar and per minute", () => {
    const rising = [candle(0, 100), candle(1, 110), candle(2, 120)];
    expect(priceVelocity(rising).perBar).toBe(10);
    expect(priceVelocity(rising).perMinute).toBe(10);
  });

  it("returns zero velocity for single candle", () => {
    expect(priceVelocity([candle(0, 100)])).toEqual({ perBar: 0, perMinute: 0 });
  });

  it("computes acceleration when velocity increases", () => {
    const accelerating = [
      candle(0, 100),
      candle(1, 101),
      candle(2, 103),
      candle(3, 106),
      candle(4, 110),
    ];
    expect(priceAcceleration(accelerating).deltaVelocityPerBar).toBeGreaterThan(0);
  });

  it("returns zero acceleration for fewer than three candles", () => {
    expect(priceAcceleration([candle(0, 100), candle(1, 101)])).toEqual({
      deltaVelocityPerBar: 0,
    });
  });
});
