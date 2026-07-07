import { describe, expect, it } from "vitest";

import {
  observationMatchesMultiAxisBucket,
  parseMultiAxisBucketId,
} from "./matchMultiAxisBucket";
import type { MispricingObservation } from "./mispricingAtlasTypes";

const NULL_TEMPORAL_AXIS_PARTS = {
  hourBucketId: null,
  dayOfWeekBucketId: null,
  sessionBucketId: null,
  weekendBucketId: null,
} as const;

function createObservation(
  overrides: Partial<MispricingObservation> = {},
): MispricingObservation {
  return {
    strategyId: "noop",
    seriesTicker: "KXBTC15M",
    marketTicker: "MARKET-A",
    outputPath: "data/research-results/noop.json",
    stepIndex: 0,
    predictedProbability: 0.35,
    observedOutcome: 1,
    timeRemainingMs: 4 * 60 * 1_000,
    moneynessPercent: -1,
    annualizedVolatility: 0.7,
    momentumPercent: null,
    tradingDayUtc: "2026-06-01",
    ...overrides,
  };
}

describe("parseMultiAxisBucketId", () => {
  it("parses probability × moneyness bucket ids", () => {
    expect(
      parseMultiAxisBucketId("coarse-prob-1-moneyness-near-below"),
    ).toEqual({
      probabilityBucketId: "coarse-prob-1",
      moneynessBucketId: "moneyness-near-below",
      timeBucketId: null,
      volatilityBucketId: null,
      momentumBucketId: null,
      ...NULL_TEMPORAL_AXIS_PARTS,
    });
  });

  it("parses volatility × probability × time bucket ids", () => {
    expect(
      parseMultiAxisBucketId("vol-high-coarse-prob-2-coarse-time-late"),
    ).toEqual({
      volatilityBucketId: "vol-high",
      probabilityBucketId: "coarse-prob-2",
      timeBucketId: "coarse-time-late",
      moneynessBucketId: null,
      momentumBucketId: null,
      ...NULL_TEMPORAL_AXIS_PARTS,
    });
  });

  it("parses probability × momentum × time bucket ids", () => {
    expect(
      parseMultiAxisBucketId(
        "coarse-prob-1-momentum-moderate-up-coarse-time-late",
      ),
    ).toEqual({
      probabilityBucketId: "coarse-prob-1",
      momentumBucketId: "momentum-moderate-up",
      timeBucketId: "coarse-time-late",
      moneynessBucketId: null,
      volatilityBucketId: null,
      ...NULL_TEMPORAL_AXIS_PARTS,
    });
  });

  it("parses momentum × volatility bucket ids", () => {
    expect(parseMultiAxisBucketId("vol-high-momentum-strong-down")).toEqual({
      volatilityBucketId: "vol-high",
      momentumBucketId: "momentum-strong-down",
      probabilityBucketId: null,
      timeBucketId: null,
      moneynessBucketId: null,
      ...NULL_TEMPORAL_AXIS_PARTS,
    });
  });
});

describe("observationMatchesMultiAxisBucket", () => {
  it("matches probability × moneyness cells", () => {
    expect(
      observationMatchesMultiAxisBucket(
        "coarse-prob-1-moneyness-near-below",
        createObservation(),
        ["probability", "moneyness"],
      ),
    ).toBe(true);
  });

  it("matches moneyness × time remaining cells", () => {
    expect(
      observationMatchesMultiAxisBucket(
        "moneyness-near-below-time-0-5m",
        createObservation(),
        ["moneyness", "time"],
      ),
    ).toBe(true);
  });

  it("matches probability × momentum cells", () => {
    expect(
      observationMatchesMultiAxisBucket(
        "coarse-prob-1-momentum-moderate-up",
        createObservation({ momentumPercent: 0.25 }),
        ["probability", "momentum"],
      ),
    ).toBe(true);
  });
});
