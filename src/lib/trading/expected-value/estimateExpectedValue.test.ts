import { describe, expect, it } from "vitest";

import { buildMarketFeatureVector } from "@/lib/features";
import type { FeatureCandle, FeatureExtractionInput } from "@/lib/features/types";
import { estimateProbability } from "@/lib/trading/probability";
import type { ProbabilityEstimate } from "@/lib/trading/probability";

import {
  DEFAULT_EXPECTED_VALUE_CONFIG,
  estimateExpectedValue,
  ExpectedValueInputError,
  EXPECTED_VALUE_MODEL_VERSION,
} from "./estimateExpectedValue";
import { goldenExpectedValueEstimate } from "./fixtures/goldenExpectedValue";
import { buildExpectedValueReasoning } from "./reasoning";

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

function createFeatureInput(): FeatureExtractionInput {
  return {
    evaluatedAtMs: BASE + 10 * 60_000,
    spotPrice: 64_500,
    candles: Array.from({ length: 12 }, (_, index) => candle(index, 64_000 + index * 40)),
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
  };
}

function mockProbability(
  overrides: Partial<ProbabilityEstimate> = {},
): ProbabilityEstimate {
  return {
    probabilityUp: 0.74,
    probabilityDown: 0.26,
    confidence: 0.8,
    modelVersion: "5.4.0",
    logOdds: 1.05,
    drivers: [],
    ...overrides,
  };
}

function defaultPricing() {
  return {
    yesBidCents: 62,
    yesAskCents: 63,
    noBidCents: 36,
    noAskCents: 37,
  };
}

describe("estimateExpectedValue", () => {
  it("returns positive EV when model probability exceeds ask", () => {
    const estimate = estimateExpectedValue({
      probability: mockProbability({ probabilityUp: 0.74, probabilityDown: 0.26 }),
      features: buildMarketFeatureVector(createFeatureInput()),
      pricing: defaultPricing(),
    });

    expect(estimate.netEvYesCents).toBeGreaterThan(0);
    expect(estimate.bestSide).toBe("yes");
    expect(estimate.edgeYesPercent).toBeGreaterThan(0);
    expect(estimate.modelVersion).toBe(EXPECTED_VALUE_MODEL_VERSION);
  });

  it("returns negative EV when model probability is below ask", () => {
    const estimate = estimateExpectedValue({
      probability: mockProbability({ probabilityUp: 0.5, probabilityDown: 0.5 }),
      features: buildMarketFeatureVector(createFeatureInput()),
      pricing: defaultPricing(),
    });

    expect(estimate.netEvYesCents).toBeLessThan(0);
    expect(estimate.edgeYesPercent).toBeLessThan(0);
  });

  it("returns zero EV when fair value matches ask", () => {
    const estimate = estimateExpectedValue({
      probability: mockProbability({ probabilityUp: 0.63, probabilityDown: 0.37 }),
      features: buildMarketFeatureVector(createFeatureInput()),
      pricing: defaultPricing(),
    });

    expect(estimate.netEvYesCents).toBeCloseTo(0, 10);
    expect(estimate.fairYesCents).toBeCloseTo(63, 10);
  });

  it("is deterministic for identical inputs", () => {
    const input = {
      probability: mockProbability(),
      features: buildMarketFeatureVector(createFeatureInput()),
      pricing: defaultPricing(),
    };

    expect(estimateExpectedValue(input)).toEqual(estimateExpectedValue(input));
  });

  it("throws on invalid probability bounds", () => {
    expect(() =>
      estimateExpectedValue({
        probability: mockProbability({ probabilityUp: 1.2, probabilityDown: -0.2 }),
        features: buildMarketFeatureVector(createFeatureInput()),
        pricing: defaultPricing(),
      }),
    ).toThrow(ExpectedValueInputError);
  });

  it("throws when probability does not sum to 1", () => {
    expect(() =>
      estimateExpectedValue({
        probability: mockProbability({ probabilityUp: 0.7, probabilityDown: 0.2 }),
        features: buildMarketFeatureVector(createFeatureInput()),
        pricing: defaultPricing(),
      }),
    ).toThrow(ExpectedValueInputError);
  });

  it("throws on invalid ask prices", () => {
    expect(() =>
      estimateExpectedValue({
        probability: mockProbability(),
        features: buildMarketFeatureVector(createFeatureInput()),
        pricing: { ...defaultPricing(), yesAskCents: null },
      }),
    ).toThrow(ExpectedValueInputError);

    expect(() =>
      estimateExpectedValue({
        probability: mockProbability(),
        features: buildMarketFeatureVector(createFeatureInput()),
        pricing: { ...defaultPricing(), noAskCents: 0 },
      }),
    ).toThrow(ExpectedValueInputError);
  });

  it("clamps EV to configured bounds", () => {
    const estimate = estimateExpectedValue(
      {
        probability: mockProbability({ probabilityUp: 0.99, probabilityDown: 0.01 }),
        features: buildMarketFeatureVector(createFeatureInput()),
        pricing: { yesBidCents: 1, yesAskCents: 2, noBidCents: 97, noAskCents: 98 },
      },
      { ...DEFAULT_EXPECTED_VALUE_CONFIG, maxAbsEvCents: 5 },
    );

    expect(Math.abs(estimate.netEvYesCents)).toBeLessThanOrEqual(5);
    expect(Math.abs(estimate.netEvNoCents)).toBeLessThanOrEqual(5);
  });

  it("applies fees to net EV", () => {
    const withoutFee = estimateExpectedValue({
      probability: mockProbability(),
      features: buildMarketFeatureVector(createFeatureInput()),
      pricing: defaultPricing(),
    });
    const withFee = estimateExpectedValue(
      {
        probability: mockProbability(),
        features: buildMarketFeatureVector(createFeatureInput()),
        pricing: defaultPricing(),
      },
      { ...DEFAULT_EXPECTED_VALUE_CONFIG, feeCentsPerContract: 2 },
    );

    expect(withFee.netEvYesCents).toBeCloseTo(withoutFee.netEvYesCents - 2, 10);
    expect(withFee.netEvNoCents).toBeCloseTo(withoutFee.netEvNoCents - 2, 10);
  });

  it("reduces confidence when spread is wide", () => {
    const tight = buildMarketFeatureVector(createFeatureInput());
    const wideInput = createFeatureInput();
    wideInput.pricing = {
      ...wideInput.pricing,
      yesBidCents: 10,
      yesAskCents: 50,
      noBidCents: 50,
      noAskCents: 90,
    };
    const wide = buildMarketFeatureVector(wideInput);

    const tightEstimate = estimateExpectedValue({
      probability: mockProbability(),
      features: tight,
      pricing: defaultPricing(),
    });
    const wideEstimate = estimateExpectedValue({
      probability: mockProbability(),
      features: wide,
      pricing: defaultPricing(),
    });

    expect(wideEstimate.confidence).toBeLessThan(tightEstimate.confidence);
  });

  it("selects NO when NO EV dominates", () => {
    const estimate = estimateExpectedValue({
      probability: mockProbability({ probabilityUp: 0.2, probabilityDown: 0.8 }),
      features: buildMarketFeatureVector(createFeatureInput()),
      pricing: { yesBidCents: 20, yesAskCents: 22, noBidCents: 75, noAskCents: 78 },
    });

    expect(estimate.bestSide).toBe("no");
    expect(estimate.netEvNoCents).toBeGreaterThan(estimate.netEvYesCents);
  });

  it("returns bestSide null when both net EVs are exactly zero", () => {
    const estimate = estimateExpectedValue({
      probability: mockProbability({ probabilityUp: 0.63, probabilityDown: 0.37 }),
      features: buildMarketFeatureVector(createFeatureInput()),
      pricing: { yesBidCents: 62, yesAskCents: 63, noBidCents: 36, noAskCents: 37 },
    });

    expect(estimate.netEvYesCents).toBeCloseTo(0, 10);
    expect(estimate.netEvNoCents).toBeCloseTo(0, 10);
    expect(estimate.bestSide).toBeNull();
    expect(estimate.bestEvCents).toBe(0);
  });

  it("handles probability boundaries P(up)=0 and P(up)=1", () => {
    const features = buildMarketFeatureVector(createFeatureInput());
    const pricing = { yesBidCents: 48, yesAskCents: 50, noBidCents: 48, noAskCents: 50 };

    const allDown = estimateExpectedValue({
      probability: mockProbability({ probabilityUp: 0, probabilityDown: 1, logOdds: -20 }),
      features,
      pricing,
    });
    const allUp = estimateExpectedValue({
      probability: mockProbability({ probabilityUp: 1, probabilityDown: 0, logOdds: 20 }),
      features,
      pricing,
    });

    expect(allDown.netEvYesCents).toBe(-50);
    expect(allDown.netEvNoCents).toBe(50);
    expect(allUp.netEvYesCents).toBe(50);
    expect(allUp.netEvNoCents).toBe(-50);
  });

  it("handles extreme ask prices at 1¢ and 99¢", () => {
    const features = buildMarketFeatureVector(createFeatureInput());

    const lowAsk = estimateExpectedValue({
      probability: mockProbability({ probabilityUp: 0.6, probabilityDown: 0.4 }),
      features,
      pricing: { yesBidCents: 1, yesAskCents: 1, noBidCents: 98, noAskCents: 99 },
    });
    const highAsk = estimateExpectedValue({
      probability: mockProbability({ probabilityUp: 0.4, probabilityDown: 0.6 }),
      features,
      pricing: { yesBidCents: 98, yesAskCents: 99, noBidCents: 1, noAskCents: 1 },
    });

    expect(lowAsk.netEvYesCents).toBeGreaterThan(0);
    expect(highAsk.netEvNoCents).toBeGreaterThan(0);
  });

  it("breaks equal non-zero EV ties in favor of YES", () => {
    // p = (100 + yesAsk - noAsk) / 200 => equal gross EV on both sides (12.5¢ at 50/25 asks).
    const estimate = estimateExpectedValue({
      probability: mockProbability({ probabilityUp: 0.625, probabilityDown: 0.375 }),
      features: buildMarketFeatureVector(createFeatureInput()),
      pricing: { yesBidCents: 48, yesAskCents: 50, noBidCents: 23, noAskCents: 25 },
    });

    expect(estimate.netEvYesCents).toBe(12.5);
    expect(estimate.netEvNoCents).toBe(12.5);
    expect(estimate.bestSide).toBe("yes");
  });

  it("matches golden fixture for canonical mock inputs", () => {
    const estimate = estimateExpectedValue({
      probability: mockProbability({ probabilityUp: 0.74, probabilityDown: 0.26 }),
      features: buildMarketFeatureVector(createFeatureInput()),
      pricing: defaultPricing(),
    });

    expect(estimate).toMatchObject({
      modelVersion: goldenExpectedValueEstimate.modelVersion,
      netEvYesCents: goldenExpectedValueEstimate.netEvYesCents,
      netEvNoCents: goldenExpectedValueEstimate.netEvNoCents,
      fairYesCents: goldenExpectedValueEstimate.fairYesCents,
      fairNoCents: goldenExpectedValueEstimate.fairNoCents,
      bestSide: goldenExpectedValueEstimate.bestSide,
      bestEvCents: goldenExpectedValueEstimate.bestEvCents,
    });
  });

  it("composes with real 5.4A estimateProbability output", () => {
    const features = buildMarketFeatureVector(createFeatureInput());
    const probability = estimateProbability(features);

    const estimate = estimateExpectedValue({
      probability,
      features,
      pricing: defaultPricing(),
    });

    expect(estimate.netEvYesCents).toBeTypeOf("number");
    expect(estimate.netEvNoCents).toBeTypeOf("number");
    expect(estimate.modelVersion).toBe(EXPECTED_VALUE_MODEL_VERSION);
  });
});

describe("buildExpectedValueReasoning", () => {
  it("produces stable reasoning for the same estimate", () => {
    const estimate = estimateExpectedValue({
      probability: mockProbability(),
      features: buildMarketFeatureVector(createFeatureInput()),
      pricing: defaultPricing(),
    });

    const first = buildExpectedValueReasoning(estimate);
    const second = buildExpectedValueReasoning(estimate);

    expect(second).toEqual(first);
    expect(first.lines.length).toBeGreaterThan(0);
    expect(first.summary).toContain("Expected value");
  });
});
