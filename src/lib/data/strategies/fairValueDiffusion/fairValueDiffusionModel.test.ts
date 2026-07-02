import { describe, expect, it } from "vitest";

import {
  computeEdgeCents,
  computeLogReturns,
  estimateFairYesProbability,
  estimateRealizedVolatility,
  evaluateFairValueDiffusion,
  inferBarIntervalMs,
  normalCdf,
} from "./fairValueDiffusionModel";

function buildFlatCandles(
  close: number,
  count: number,
  startTimestamp = 1_700_000_000_000,
  intervalMs = 60_000,
) {
  return Array.from({ length: count }, (_, index) => ({
    timestamp: startTimestamp + index * intervalMs,
    open: close,
    high: close,
    low: close,
    close,
  }));
}

describe("fairValueDiffusionModel", () => {
  it("computes a deterministic standard normal cdf", () => {
    expect(normalCdf(0)).toBeCloseTo(0.5, 6);
    expect(normalCdf(1.96)).toBeCloseTo(0.975, 3);
    expect(normalCdf(-1.96)).toBeCloseTo(0.025, 3);
    expect(normalCdf(0)).toBe(normalCdf(0));
  });

  it("derives log returns from consecutive closes", () => {
    expect(computeLogReturns([100, 110])).toEqual([Math.log(1.1)]);
    expect(computeLogReturns([100])).toBeNull();
    expect(computeLogReturns([0, 100])).toBeNull();
  });

  it("infers bar interval from the latest candle pair", () => {
    const candles = buildFlatCandles(60_000, 3, 1_000, 30_000);
    expect(inferBarIntervalMs(candles)).toBe(30_000);
    expect(inferBarIntervalMs(buildFlatCandles(60_000, 1))).toBe(60_000);
  });

  it("returns null when volatility history is insufficient", () => {
    const candles = buildFlatCandles(60_000, 5);
    expect(estimateRealizedVolatility(candles, 10)).toBeNull();
  });

  it("estimates fair yes probability from spot, strike, time, and vol", () => {
    const estimate = estimateFairYesProbability(
      {
        spotPrice: 61_000,
        strikePrice: 60_000,
        timeRemainingMs: 900_000,
        candles: buildFlatCandles(61_000, 12),
        volatilityLookbackBars: 10,
      },
      0.5,
    );

    expect(estimate).not.toBeNull();
    expect(estimate?.fairYesProbability).toBeGreaterThan(0.9);
  });

  it("computes edge in cents against implied yes mid", () => {
    expect(computeEdgeCents(0.62, 50)).toEqual({
      fairYesProbabilityCents: 62,
      impliedYesMidCents: 50,
      edgeCents: 12,
    });
    expect(computeEdgeCents(Number.NaN, 50)).toBeNull();
  });

  it("evaluates diffusion inputs end-to-end", () => {
    const candles = buildFlatCandles(61_000, 12);
    const result = evaluateFairValueDiffusion({
      spotPrice: 61_000,
      strikePrice: 60_000,
      timeRemainingMs: 900_000,
      candles,
      volatilityLookbackBars: 10,
    });

    expect(result).not.toBeNull();
    expect(result?.volatility.sampleCount).toBe(10);
    expect(result?.probability.fairYesProbability).toBeGreaterThan(0.99);
  });
});
