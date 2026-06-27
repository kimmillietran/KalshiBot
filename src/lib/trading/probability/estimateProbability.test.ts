import { describe, expect, it } from "vitest";

import { buildMarketFeatureVector } from "@/lib/features";
import type { FeatureCandle, FeatureExtractionInput, MarketFeatureVector } from "@/lib/features/types";

import {
  DEFAULT_PROBABILITY_MODEL_CONFIG,
  estimateProbability,
  PROBABILITY_MODEL_VERSION,
} from "./estimateProbability";

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

function risingCandles(start: number, count: number): FeatureCandle[] {
  return Array.from({ length: count }, (_, index) =>
    candle(index, start + index * 50),
  );
}

function createInput(
  overrides: Partial<FeatureExtractionInput> = {},
): FeatureExtractionInput {
  return {
    evaluatedAtMs: BASE + 10 * 60_000,
    spotPrice: 64_500,
    candles: risingCandles(64_000, 12),
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

function vectorFromInput(
  overrides: Partial<FeatureExtractionInput> = {},
): MarketFeatureVector {
  return buildMarketFeatureVector(createInput(overrides));
}

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

describe("estimateProbability", () => {
  it("returns the same estimate for the same feature vector", () => {
    const features = vectorFromInput();
    const first = estimateProbability(features);
    const second = estimateProbability(features);
    expect(second).toEqual(first);
  });

  it("does not mutate the input feature vector", () => {
    const features = vectorFromInput();
    const before = deepClone(features);
    estimateProbability(features);
    expect(features).toEqual(before);
  });

  it("returns probabilities in [0, 1] that sum to 1", () => {
    const estimate = estimateProbability(vectorFromInput());
    expect(estimate.probabilityUp).toBeGreaterThanOrEqual(0);
    expect(estimate.probabilityUp).toBeLessThanOrEqual(1);
    expect(estimate.probabilityDown).toBeGreaterThanOrEqual(0);
    expect(estimate.probabilityDown).toBeLessThanOrEqual(1);
    expect(estimate.probabilityUp + estimate.probabilityDown).toBeCloseTo(1, 10);
  });

  it("returns confidence in [0, 1] and model version", () => {
    const estimate = estimateProbability(vectorFromInput());
    expect(estimate.confidence).toBeGreaterThanOrEqual(0);
    expect(estimate.confidence).toBeLessThanOrEqual(1);
    expect(estimate.modelVersion).toBe(PROBABILITY_MODEL_VERSION);
    expect(estimate.drivers.length).toBeGreaterThan(0);
  });

  it("favors UP when spot is well above strike with bullish tape", () => {
    const features = vectorFromInput({
      spotPrice: 65_000,
      market: {
        strikePrice: 64_000,
        timeRemainingMs: 600_000,
        closeTime: "2026-06-26T12:15:00.000Z",
      },
      candles: risingCandles(64_500, 12),
    });

    const estimate = estimateProbability(features);
    expect(estimate.probabilityUp).toBeGreaterThan(0.52);
    expect(estimate.probabilityDown).toBeLessThan(0.48);
  });

  it("favors DOWN when spot is well below strike with bearish tape", () => {
    const falling = Array.from({ length: 12 }, (_, index) =>
      candle(index, 64_500 - index * 80),
    );

    const features = vectorFromInput({
      spotPrice: 63_500,
      market: {
        strikePrice: 64_500,
        timeRemainingMs: 600_000,
        closeTime: "2026-06-26T12:15:00.000Z",
      },
      candles: falling,
    });

    const estimate = estimateProbability(features);
    expect(estimate.probabilityUp).toBeLessThan(0.48);
    expect(estimate.probabilityDown).toBeGreaterThan(0.52);
  });

  it("stays near 50/50 when spot equals strike on a flat tape", () => {
    const flat = Array.from({ length: 12 }, (_, index) =>
      candle(index, 64_000),
    );

    const features = vectorFromInput({
      spotPrice: 64_000,
      market: {
        strikePrice: 64_000,
        timeRemainingMs: 600_000,
        closeTime: "2026-06-26T12:15:00.000Z",
      },
      candles: flat,
    });

    const estimate = estimateProbability(features);
    expect(estimate.probabilityUp).toBeCloseTo(0.5, 1);
    expect(estimate.probabilityDown).toBeCloseTo(0.5, 1);
  });

  it("amplifies distance signal as expiry approaches", () => {
    const baseFeatures = vectorFromInput({
      spotPrice: 65_000,
      market: {
        strikePrice: 64_000,
        timeRemainingMs: 600_000,
        closeTime: "2026-06-26T12:15:00.000Z",
      },
    });
    const urgentFeatures = vectorFromInput({
      spotPrice: 65_000,
      market: {
        strikePrice: 64_000,
        timeRemainingMs: 60_000,
        closeTime: "2026-06-26T12:15:00.000Z",
      },
    });

    const base = estimateProbability(baseFeatures);
    const urgent = estimateProbability(urgentFeatures);

    expect(urgent.probabilityUp).toBeGreaterThan(base.probabilityUp);
  });

  it("reduces confidence when candle depth is shallow", () => {
    const deep = estimateProbability(
      vectorFromInput({ candles: risingCandles(64_000, 12) }),
    );
    const shallow = estimateProbability(
      vectorFromInput({ candles: risingCandles(64_000, 2) }),
    );

    expect(shallow.confidence).toBeLessThan(deep.confidence);
  });

  it("records driver contributions that sum to pre-dampen log-odds", () => {
    const estimate = estimateProbability(vectorFromInput());
    const coreDrivers = estimate.drivers.filter((driver) =>
      ["distance", "momentum", "trend", "crossTarget"].includes(driver.driver),
    );
    const coreSum = coreDrivers.reduce(
      (sum, driver) => sum + driver.logOddsAdjustment,
      0,
    );

    expect(coreSum).toBeCloseTo(
      estimate.drivers
        .filter((driver) => driver.driver === "distance")
        .reduce((sum, driver) => sum + driver.logOddsAdjustment, 0) +
        estimate.drivers
          .filter((driver) => driver.driver === "momentum")
          .reduce((sum, driver) => sum + driver.logOddsAdjustment, 0) +
        estimate.drivers
          .filter((driver) => driver.driver === "trend")
          .reduce((sum, driver) => sum + driver.logOddsAdjustment, 0) +
        estimate.drivers
          .filter((driver) => driver.driver === "crossTarget")
          .reduce((sum, driver) => sum + driver.logOddsAdjustment, 0),
      10,
    );
    expect(estimate.logOdds).toBeTypeOf("number");
  });

  it("is deterministic for identical custom config", () => {
    const features = vectorFromInput();
    const config = {
      ...DEFAULT_PROBABILITY_MODEL_CONFIG,
      distanceWeight: 0.5,
      momentumWeight: 0.2,
    };

    expect(estimateProbability(features, config)).toEqual(
      estimateProbability(features, config),
    );
  });

  it("handles expired market without throwing", () => {
    const features = vectorFromInput({
      market: {
        strikePrice: 64_000,
        timeRemainingMs: 0,
        closeTime: "2026-06-26T12:15:00.000Z",
      },
    });

    const estimate = estimateProbability(features);
    expect(estimate.probabilityUp).toBeGreaterThanOrEqual(0);
    expect(estimate.probabilityUp).toBeLessThanOrEqual(1);
    expect(estimate.probabilityUp + estimate.probabilityDown).toBeCloseTo(1, 10);
  });

  it("handles empty candles without throwing", () => {
    const features = vectorFromInput({ candles: [] });
    const estimate = estimateProbability(features);
    expect(estimate.probabilityUp + estimate.probabilityDown).toBeCloseTo(1, 10);
    expect(estimate.confidence).toBeLessThan(
      estimateProbability(vectorFromInput()).confidence,
    );
  });
});

describe("DEFAULT_PROBABILITY_MODEL_CONFIG", () => {
  it("uses positive distance weight and bounded urgency", () => {
    expect(DEFAULT_PROBABILITY_MODEL_CONFIG.distanceWeight).toBeGreaterThan(0);
    expect(DEFAULT_PROBABILITY_MODEL_CONFIG.timeUrgencyMaxAmplify).toBeGreaterThanOrEqual(1);
  });
});
