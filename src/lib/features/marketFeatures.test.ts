import { describe, expect, it } from "vitest";

import type { FeatureCandle, FeatureExtractionInput } from "./types";
import {
  buildMarketFeatureVector,
  contractTimeRemaining,
  liquidityScore,
  minutesUntilSettlement,
  spreadPercent,
  volumeBucket,
} from "./marketFeatures";

const BASE = 1_700_000_000_000;

function candle(index: number, close: number): FeatureCandle {
  return {
    timestamp: BASE + index * 60_000,
    open: close - 5,
    high: close + 5,
    low: close - 10,
    close,
  };
}

function createInput(
  overrides: Partial<FeatureExtractionInput> = {},
): FeatureExtractionInput {
  return {
    evaluatedAtMs: BASE + 5 * 60_000,
    spotPrice: 64_500,
    candles: [
      candle(0, 64_000),
      candle(1, 64_100),
      candle(2, 64_200),
      candle(3, 64_300),
      candle(4, 64_400),
      candle(5, 64_500),
    ],
    market: {
      strikePrice: 64_475,
      timeRemainingMs: 600_000,
      closeTime: "2026-06-26T12:15:00.000Z",
    },
    pricing: {
      yesBidCents: 62,
      yesAskCents: 64,
      noBidCents: 36,
      noAskCents: 38,
      volumeDollars: 503_000,
      liquidityQuality: "Good",
    },
    ...overrides,
  };
}

describe("marketFeatures", () => {
  it("builds a complete feature vector", () => {
    const vector = buildMarketFeatureVector(createInput());

    expect(vector.distanceToTarget.signed).toBe(25);
    expect(vector.percentToTarget.percent).toBeGreaterThan(0);
    expect(vector.trend.direction).toBe("bullish");
    expect(vector.liquidity.score).toBe(75);
    expect(vector.volume.bucket).toBe("high");
    expect(vector.timeRemaining.expired).toBe(false);
  });

  it("handles expired market", () => {
    const expired = minutesUntilSettlement(0);
    expect(expired.expired).toBe(true);
    expect(expired.minutes).toBe(0);
    expect(contractTimeRemaining(-1_000).expired).toBe(true);
  });

  it("computes zero spread percent", () => {
    const zeroSpread = spreadPercent({
      yesBidCents: 50,
      yesAskCents: 50,
      noBidCents: 50,
      noAskCents: 50,
      volumeDollars: null,
      liquidityQuality: "Fair",
    });
    expect(zeroSpread.yesSpreadPercent).toBe(0);
    expect(zeroSpread.maxSpreadPercent).toBe(0);
  });

  it("computes large spread percent", () => {
    const wide = spreadPercent({
      yesBidCents: 10,
      yesAskCents: 50,
      noBidCents: null,
      noAskCents: null,
      volumeDollars: null,
      liquidityQuality: "Poor",
    });
    expect(wide.yesSpreadPercent).toBe(80);
  });

  it("maps liquidity quality to score", () => {
    expect(liquidityScore({ ...createInput().pricing, liquidityQuality: "Excellent" }).score).toBe(100);
  });

  it("buckets volume", () => {
    expect(volumeBucket(null).bucket).toBe("unknown");
    expect(volumeBucket(10_000).bucket).toBe("low");
    expect(volumeBucket(100_000).bucket).toBe("medium");
    expect(volumeBucket(600_000).bucket).toBe("high");
  });

  it("handles empty candles in vector build", () => {
    const vector = buildMarketFeatureVector(createInput({ candles: [] }));
    expect(vector.lastCandleDirection.direction).toBeNull();
    expect(vector.momentum.bars).toBe(0);
  });

  it("handles single candle", () => {
    const vector = buildMarketFeatureVector(
      createInput({ candles: [candle(0, 64_250)] }),
    );
    expect(vector.volatility.bars).toBe(1);
    expect(vector.priceVelocity.perBar).toBe(0);
  });

  it("is deterministic for identical inputs", () => {
    const input = createInput();
    expect(buildMarketFeatureVector(input)).toEqual(buildMarketFeatureVector(input));
  });
});
