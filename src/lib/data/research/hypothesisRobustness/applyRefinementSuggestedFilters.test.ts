import { describe, expect, it } from "vitest";

import { applyRefinementSuggestedFilters } from "./applyRefinementSuggestedFilters";
import type { EnrichedMispricingObservation } from "./hypothesisRobustnessTypes";

function createObservation(
  overrides: Partial<EnrichedMispricingObservation> = {},
): EnrichedMispricingObservation {
  return {
    strategyId: "strategy-a",
    seriesTicker: "KXBTC15M",
    marketTicker: "KXBTC15M-TEST",
    outputPath: "data/research-results/out.json",
    stepIndex: 0,
    predictedProbability: 0.4,
    observedOutcome: 0,
    timeRemainingMs: 4 * 60 * 1_000,
    moneynessPercent: 0,
    annualizedVolatility: 0.7,
    timestampMs: 1_700_000_000_000,
    tradingDayUtc: "2026-02-01",
    calendarMonth: "2026-02",
    calendarQuarter: "2026-Q1",
    volatilityRegime: "high",
    ...overrides,
  };
}

describe("applyRefinementSuggestedFilters", () => {
  it("filters by probability range and excluded months", () => {
    const observations = [
      createObservation({ predictedProbability: 0.35, calendarMonth: "2026-02" }),
      createObservation({ predictedProbability: 0.55, calendarMonth: "2026-03" }),
      createObservation({ predictedProbability: 0.35, calendarMonth: "2026-03" }),
    ];

    const filtered = applyRefinementSuggestedFilters(observations, {
      probabilityRangeLabel: "[0.3, 0.5)",
      excludedMonths: ["2026-03"],
    });

    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.calendarMonth).toBe("2026-02");
  });

  it("filters by time and volatility buckets", () => {
    const observations = [
      createObservation({ timeRemainingMs: 4 * 60 * 1_000, annualizedVolatility: 0.7 }),
      createObservation({ timeRemainingMs: 12 * 60 * 1_000, annualizedVolatility: 0.4 }),
    ];

    const filtered = applyRefinementSuggestedFilters(observations, {
      timeBucketId: "time-0-5m",
      volatilityBucketId: "vol-high",
    });

    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.timeRemainingMs).toBe(4 * 60 * 1_000);
  });
});
