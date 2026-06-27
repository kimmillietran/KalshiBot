import { describe, expect, it } from "vitest";

import { DEFAULT_ENGINE_CONFIG } from "@/lib/trading/config/defaults";
import type { ExpectedValueEstimate } from "@/lib/trading/expected-value/types";
import type { ProbabilityEstimate } from "@/lib/trading/probability/types";
import type { TradeAction } from "@/types/domain/trading";

import {
  DEFAULT_POSITION_SIZING_CONFIG,
  estimatePositionSize,
  POSITION_SIZING_MODEL_VERSION,
  rawKellyFraction,
} from "./estimatePositionSize";
import { buildPositionSizingReasoning } from "./reasoning";

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

function mockExpectedValue(
  overrides: Partial<ExpectedValueEstimate> = {},
): ExpectedValueEstimate {
  return {
    modelVersion: "5.5.0",
    evYesCents: 12,
    evNoCents: -5,
    netEvYesCents: 12,
    netEvNoCents: -5,
    fairYesCents: 74,
    fairNoCents: 26,
    edgeYesPercent: 17.46,
    edgeNoPercent: -13.16,
    bestSide: "yes",
    bestEvCents: 12,
    confidence: 0.75,
    reasoning: { summary: "mock", lines: [] },
    ...overrides,
  };
}

function sizingInput(
  action: TradeAction,
  overrides: {
    probability?: Partial<ProbabilityEstimate>;
    expectedValue?: Partial<ExpectedValueEstimate>;
    bankrollDollars?: number | null;
  } = {},
) {
  return {
    action,
    probability: mockProbability(overrides.probability),
    expectedValue: mockExpectedValue(overrides.expectedValue),
    engineConfig: DEFAULT_ENGINE_CONFIG,
    ...(overrides.bankrollDollars !== undefined
      ? { bankrollDollars: overrides.bankrollDollars }
      : {}),
  };
}

describe("estimatePositionSize", () => {
  it("returns zero size for NO TRADE", () => {
    const estimate = estimatePositionSize(sizingInput("NO TRADE"));

    expect(estimate.recommendedFraction).toBe(0);
    expect(estimate.recommendedPercent).toBe(0);
    expect(estimate.recommendedDollars).toBeNull();
    expect(estimate.side).toBeNull();
    expect(estimate.modelVersion).toBe(POSITION_SIZING_MODEL_VERSION);
  });

  it("returns zero size for HOLD", () => {
    const estimate = estimatePositionSize(sizingInput("HOLD"));

    expect(estimate.recommendedFraction).toBe(0);
    expect(estimate.recommendedPercent).toBe(0);
    expect(estimate.recommendedDollars).toBeNull();
    expect(estimate.side).toBeNull();
  });

  it("returns positive Kelly size for BUY UP", () => {
    const estimate = estimatePositionSize(sizingInput("BUY UP"));

    expect(estimate.side).toBe("yes");
    expect(estimate.rawKellyFraction).toBeGreaterThan(0);
    expect(estimate.recommendedFraction).toBeGreaterThan(0);
    expect(estimate.recommendedPercent).toBe(estimate.recommendedFraction * 100);
  });

  it("returns positive Kelly size for BUY DOWN", () => {
    const estimate = estimatePositionSize(
      sizingInput("BUY DOWN", {
        expectedValue: {
          netEvYesCents: -4,
          netEvNoCents: 10,
          edgeYesPercent: -6,
          edgeNoPercent: 27.03,
          fairNoCents: 62,
          bestSide: "no",
          bestEvCents: 10,
        },
        probability: { probabilityUp: 0.38, probabilityDown: 0.62 },
      }),
    );

    expect(estimate.side).toBe("no");
    expect(estimate.recommendedFraction).toBeGreaterThan(0);
  });

  it("returns zero when edge or Kelly is non-positive", () => {
    const lowEdge = estimatePositionSize(
      sizingInput("BUY UP", {
        expectedValue: {
          netEvYesCents: 2,
          edgeYesPercent: 3,
        },
      }),
    );
    const negativeKelly = estimatePositionSize(
      sizingInput("BUY UP", {
        probability: { probabilityUp: 0.55, probabilityDown: 0.45 },
        expectedValue: {
          fairYesCents: 55,
          edgeYesPercent: 0,
          netEvYesCents: -1,
          edgeNoPercent: 0,
        },
      }),
    );

    expect(lowEdge.recommendedFraction).toBe(0);
    expect(negativeKelly.recommendedFraction).toBe(0);
  });

  it("returns zero when capped fraction is below minFraction floor", () => {
    const estimate = estimatePositionSize(
      sizingInput("BUY UP", {
        probability: {
          probabilityUp: 0.58,
          probabilityDown: 0.42,
          confidence: 0.5,
        },
        expectedValue: {
          fairYesCents: 58,
          edgeYesPercent: 6,
          netEvYesCents: 2,
          confidence: 0.5,
        },
      }),
      {
        ...DEFAULT_POSITION_SIZING_CONFIG,
        kellyFraction: 0.01,
        maxFraction: 1,
        minFraction: 0.005,
      },
    );

    expect(estimate.cappedFraction).toBeGreaterThan(0);
    expect(estimate.cappedFraction).toBeLessThan(0.005);
    expect(estimate.recommendedFraction).toBe(0);
  });

  it("accepts edge exactly at minEdgePercent threshold", () => {
    const estimate = estimatePositionSize(
      sizingInput("BUY UP", {
        expectedValue: {
          edgeYesPercent: DEFAULT_ENGINE_CONFIG.minEdgePercent,
          netEvYesCents: 5,
        },
      }),
    );

    expect(estimate.recommendedFraction).toBeGreaterThan(0);
  });

  it("dampens size by combined confidence", () => {
    const high = estimatePositionSize(sizingInput("BUY UP"));
    const low = estimatePositionSize(
      sizingInput("BUY UP", {
        probability: { confidence: 0.4 },
        expectedValue: { confidence: 0.4 },
      }),
    );

    expect(low.recommendedFraction).toBeLessThan(high.recommendedFraction);
  });

  it("applies max position cap", () => {
    const estimate = estimatePositionSize(
      sizingInput("BUY UP", {
        probability: { probabilityUp: 0.95, probabilityDown: 0.05, confidence: 1 },
        expectedValue: {
          fairYesCents: 95,
          edgeYesPercent: 40,
          netEvYesCents: 30,
          confidence: 1,
        },
      }),
      { ...DEFAULT_POSITION_SIZING_CONFIG, kellyFraction: 1, maxFraction: 0.05 },
    );

    expect(estimate.recommendedFraction).toBeLessThanOrEqual(0.05);
    expect(estimate.cappedFraction).toBe(0.05);
  });

  it("applies fractional Kelly multiplier", () => {
    const full = estimatePositionSize(sizingInput("BUY UP"), {
      ...DEFAULT_POSITION_SIZING_CONFIG,
      kellyFraction: 1,
      maxFraction: 1,
    });
    const quarter = estimatePositionSize(sizingInput("BUY UP"), {
      ...DEFAULT_POSITION_SIZING_CONFIG,
      kellyFraction: 0.25,
      maxFraction: 1,
    });

    expect(quarter.recommendedFraction).toBeLessThan(full.recommendedFraction);
    expect(quarter.recommendedFraction).toBeCloseTo(
      full.recommendedFraction * 0.25,
      10,
    );
  });

  it("returns dollars = null when bankroll is unavailable", () => {
    const estimate = estimatePositionSize(sizingInput("BUY UP"));

    expect(estimate.recommendedDollars).toBeNull();
  });

  it("computes recommended dollars when bankroll is provided", () => {
    const estimate = estimatePositionSize(
      sizingInput("BUY UP", { bankrollDollars: 1_000 }),
    );

    expect(estimate.recommendedDollars).not.toBeNull();
    expect(estimate.recommendedDollars).toBeCloseTo(
      1_000 * estimate.recommendedFraction,
      8,
    );
  });

  it("handles invalid inputs safely with zero size", () => {
    const estimate = estimatePositionSize(
      sizingInput("BUY UP", {
        expectedValue: { edgeYesPercent: Number.NaN },
      }),
    );

    expect(estimate.recommendedFraction).toBe(0);
    expect(estimate.side).toBe("yes");
  });

  it("is deterministic for identical inputs", () => {
    const input = sizingInput("BUY UP", { bankrollDollars: 500 });

    expect(estimatePositionSize(input)).toEqual(estimatePositionSize(input));
  });

  it("keeps reasoning stable for the same estimate", () => {
    const estimate = estimatePositionSize(sizingInput("BUY UP"));
    const rebuilt = buildPositionSizingReasoning({
      action: "BUY UP",
      side: estimate.side,
      rawKellyFraction: estimate.rawKellyFraction,
      cappedFraction: estimate.cappedFraction,
      recommendedFraction: estimate.recommendedFraction,
      recommendedDollars: estimate.recommendedDollars,
      winProbability: 0.74,
      askCents: 63,
      confidence: 0.75,
      kellyFraction: DEFAULT_POSITION_SIZING_CONFIG.kellyFraction,
      maxFraction: DEFAULT_POSITION_SIZING_CONFIG.maxFraction,
      minFraction: DEFAULT_POSITION_SIZING_CONFIG.minFraction,
      minEdgePercent: DEFAULT_ENGINE_CONFIG.minEdgePercent,
      edgePercent: 17.46,
    });

    expect(estimate.reasoning).toEqual(rebuilt);
  });

  it("bounds outputs to non-negative capped fractions", () => {
    const estimate = estimatePositionSize(sizingInput("BUY UP"));

    expect(estimate.rawKellyFraction).toBeGreaterThanOrEqual(0);
    expect(estimate.cappedFraction).toBeGreaterThanOrEqual(0);
    expect(estimate.recommendedFraction).toBeGreaterThanOrEqual(0);
    expect(estimate.recommendedFraction).toBeLessThanOrEqual(
      DEFAULT_POSITION_SIZING_CONFIG.maxFraction,
    );
  });
});

describe("rawKellyFraction", () => {
  it("matches binary contract Kelly formula", () => {
    const p = 0.74;
    const ask = 63;
    const b = (100 - ask) / ask;
    const expected = (b * p - (1 - p)) / b;

    expect(rawKellyFraction(p, ask)).toBeCloseTo(expected, 10);
  });
});
