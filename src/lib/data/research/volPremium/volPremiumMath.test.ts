import { describe, expect, it } from "vitest";

import {
  computeVolPremium,
  estimateForwardRealizedVolatility,
  estimateImpliedVolatility,
  normalInv,
  probabilityFromDiffusionVol,
} from "./volPremiumMath";
import { ImpliedVolatilityInversionCode } from "./volPremiumTypes";

describe("normalInv", () => {
  it("inverts the standard normal cdf at key quantiles", () => {
    expect(normalInv(0.5)).toBeCloseTo(0, 5);
    expect(normalInv(0.975)).toBeCloseTo(1.96, 2);
    expect(normalInv(0.025)).toBeCloseTo(-1.96, 2);
    expect(normalInv(0)).toBeNull();
    expect(normalInv(1)).toBeNull();
  });
});

describe("estimateImpliedVolatility", () => {
  const baseInput = {
    spotPrice: 61_000,
    strikePrice: 60_000,
    timeRemainingMs: 24 * 60 * 60 * 1_000,
  };

  it("round-trips diffusion probability inversion", () => {
    const targetVol = 0.45;
    const impliedProbability = probabilityFromDiffusionVol({
      ...baseInput,
      annualizedVol: targetVol,
    });

    expect(impliedProbability).not.toBeNull();

    const inverted = estimateImpliedVolatility({
      ...baseInput,
      impliedProbability: impliedProbability!,
    });

    expect(inverted.ok).toBe(true);
    if (inverted.ok) {
      expect(inverted.annualizedVol).toBeCloseTo(targetVol, 3);
    }
  });

  it("rejects boundary probabilities", () => {
    expect(
      estimateImpliedVolatility({ ...baseInput, impliedProbability: 0 }),
    ).toEqual({
      ok: false,
      code: ImpliedVolatilityInversionCode.BOUNDARY_PROBABILITY,
    });
    expect(
      estimateImpliedVolatility({ ...baseInput, impliedProbability: 1 }),
    ).toEqual({
      ok: false,
      code: ImpliedVolatilityInversionCode.BOUNDARY_PROBABILITY,
    });
  });

  it("rejects atm probability when spot differs from strike", () => {
    const result = estimateImpliedVolatility({
      spotPrice: 61_000,
      strikePrice: 60_000,
      timeRemainingMs: 900_000,
      impliedProbability: 0.5,
    });

    expect(result).toEqual({
      ok: false,
      code: ImpliedVolatilityInversionCode.ATM_MISMATCH,
    });
  });

  it("rejects zero time remaining", () => {
    const result = estimateImpliedVolatility({
      ...baseInput,
      timeRemainingMs: 0,
      impliedProbability: 0.7,
    });

    expect(result).toEqual({
      ok: false,
      code: ImpliedVolatilityInversionCode.ZERO_TIME,
    });
  });
});

describe("computeVolPremium", () => {
  it("subtracts realized forward vol from implied vol", () => {
    expect(computeVolPremium(0.5, 0.35)).toBeCloseTo(0.15, 6);
    expect(computeVolPremium(null, 0.35)).toBeNull();
    expect(computeVolPremium(0.5, null)).toBeNull();
  });
});

describe("estimateForwardRealizedVolatility", () => {
  it("uses candles strictly after evaluation through market close", () => {
    const candles = Array.from({ length: 20 }, (_, index) => {
      const close = 60_000 * (1 + 0.005 * Math.sin(index));
      return {
        timestamp: 1_700_000_000_000 + index * 60_000,
        open: close,
        high: close * 1.001,
        low: close * 0.999,
        close,
      };
    });

    const evalTimestamp = candles[5]!.timestamp;
    const closeTimestamp = candles[16]!.timestamp;
    const estimate = estimateForwardRealizedVolatility(
      candles,
      evalTimestamp,
      closeTimestamp,
      10,
    );

    expect(estimate).not.toBeNull();
    expect(estimate?.annualizedVol).toBeGreaterThan(0);
    expect(Number.isFinite(estimate?.annualizedVol)).toBe(true);
  });

  it("returns null when the forward window is too short", () => {
    const candles = Array.from({ length: 5 }, (_, index) => ({
      timestamp: 1_700_000_000_000 + index * 60_000,
      open: 60_000,
      high: 60_100,
      low: 59_900,
      close: 60_000 + index * 10,
    }));

    expect(
      estimateForwardRealizedVolatility(
        candles,
        candles[1]!.timestamp,
        candles[4]!.timestamp,
        10,
      ),
    ).toBeNull();
  });
});
