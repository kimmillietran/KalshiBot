import { describe, expect, it } from "vitest";

import type { MispricingObservation } from "@/lib/data/research/mispricingAtlas/mispricingAtlasTypes";

import { observationMatchesAtlasBucket } from "./observationMatchesAtlasBucket";

function createObservation(
  overrides: Partial<MispricingObservation> = {},
): MispricingObservation {
  return {
    strategyId: "noop",
    seriesTicker: "KXBTC15M",
    marketTicker: "KXBTC15M-MARKET-A",
    outputPath: "data/research-results/noop/KXBTC15M/KXBTC15M-MARKET-A/research-output.json",
    stepIndex: 0,
    predictedProbability: 0.75,
    observedOutcome: 1,
    timeRemainingMs: 12 * 60_000,
    moneynessPercent: 1.5,
    annualizedVolatility: 0.8,
    ...overrides,
  };
}

describe("observationMatchesAtlasBucket", () => {
  it("matches volatility buckets", () => {
    expect(
      observationMatchesAtlasBucket(
        "volatility",
        "vol-high",
        createObservation({ annualizedVolatility: 0.9 }),
      ),
    ).toBe(true);

    expect(
      observationMatchesAtlasBucket(
        "volatility",
        "vol-high",
        createObservation({ annualizedVolatility: 0.2 }),
      ),
    ).toBe(false);
  });

  it("matches coarse probability-only buckets", () => {
    expect(
      observationMatchesAtlasBucket(
        "probabilityOnly",
        "coarse-prob-3",
        createObservation({ predictedProbability: 0.7 }),
      ),
    ).toBe(true);
  });
});
