import { describe, expect, it } from "vitest";

import {
  assertResearchAxisGroupRegistryMatchesHypothesisGroups,
  buildCompositeBucketTemplates,
  buildCoarseProbabilityAxisDefinitions,
  COARSE_TIME_REMAINING_AXIS_DEFINITIONS,
  getResearchAxisGroup,
  getResearchDimension,
  listResearchAxisGroups,
  MONEYNESS_BUCKET_DEFINITIONS,
  MOMENTUM_BUCKET_DEFINITIONS,
  observationMatchesDimensionBuckets,
  observationMatchesMultiAxisBucket,
  observationMatchesSingleDimensionBucket,
  RESEARCH_AXIS_GROUPS,
  RESEARCH_DIMENSIONS,
  TIME_REMAINING_BUCKET_DEFINITIONS,
  VOLATILITY_BUCKET_DEFINITIONS,
} from "./index";
import type { MispricingObservation } from "@/lib/data/research/mispricingAtlas/mispricingAtlasTypes";

function createObservation(
  overrides: Partial<MispricingObservation> = {},
): MispricingObservation {
  return {
    strategyId: "noop",
    seriesTicker: "KXBTC15M",
    marketTicker: "KXBTC15M-MARKET-A",
    outputPath: "data/research-results/noop/KXBTC15M/MARKET-A/research-output.json",
    stepIndex: 0,
    predictedProbability: 0.55,
    observedOutcome: 1,
    timeRemainingMs: 10 * 60 * 1_000,
    moneynessPercent: 1.5,
    annualizedVolatility: 0.45,
    momentumPercent: 0.25,
    tradingDayUtc: "2026-06-01",
    ...overrides,
  };
}

describe("research dimension registry", () => {
  it("matches hypothesis atlas group ids exactly", () => {
    expect(() => assertResearchAxisGroupRegistryMatchesHypothesisGroups()).not.toThrow();
    expect(RESEARCH_AXIS_GROUPS).toHaveLength(16);
  });

  it("lists dimensions in deterministic order", () => {
    expect(RESEARCH_DIMENSIONS.map((dimension) => dimension.id)).toEqual([
      "probability",
      "coarseProbability",
      "coarseProbabilityAxis",
      "timeRemaining",
      "coarseTimeRemaining",
      "moneyness",
      "volatility",
      "momentum15m",
    ]);
  });

  it("builds the same probability-time composite bucket count as legacy cartesian product", () => {
    const templates = buildCompositeBucketTemplates([
      "coarseProbabilityAxis",
      "coarseTimeRemaining",
    ]);

    expect(templates).toHaveLength(
      buildCoarseProbabilityAxisDefinitions().length
        * COARSE_TIME_REMAINING_AXIS_DEFINITIONS.length,
    );
    expect(templates[0]?.bucketId).toBe("coarse-prob-0-coarse-time-early");
  });

  it("matches single-dimension buckets via registry matchers", () => {
    const observation = createObservation();
    const bucketId = TIME_REMAINING_BUCKET_DEFINITIONS[1]!.bucketId;

    expect(
      observationMatchesSingleDimensionBucket("timeRemaining", bucketId, observation),
    ).toBe(true);
    expect(
      observationMatchesSingleDimensionBucket("moneyness", bucketId, observation),
    ).toBe(false);
  });

  it("matches multi-axis buckets via matcher axes", () => {
    const observation = createObservation({
      predictedProbability: 0.35,
      moneynessPercent: 1.5,
    });

    const bucketId = "coarse-prob-1-moneyness-near-above";

    expect(
      observationMatchesMultiAxisBucket(bucketId, observation, [
        "probability",
        "moneyness",
      ]),
    ).toBe(true);

    const group = getResearchAxisGroup("probabilityMoneyness");
    expect(
      observationMatchesDimensionBuckets(
        observation,
        group.dimensionIds,
        [
          buildCoarseProbabilityAxisDefinitions()[1]!,
          MONEYNESS_BUCKET_DEFINITIONS[2]!,
        ],
      ),
    ).toBe(true);
  });

  it("exposes axis groups in the same order as hypothesis candidate collection", () => {
    expect(listResearchAxisGroups().map((group) => group.groupId)).toEqual([
      "probabilityOnly",
      "probabilityTime",
      "probabilityRegime",
      "probabilityMoneyness",
      "moneynessTime",
      "volatilityMoneyness",
      "volatilityProbabilityTime",
      "probabilityMomentumTime",
      "probabilityMomentum",
      "momentumVolatility",
      "momentumTime",
      "momentum",
      "probability",
      "timeRemaining",
      "moneyness",
      "volatility",
    ]);
  });

  it("builds momentum composite bucket counts", () => {
    const templates = buildCompositeBucketTemplates(["coarseProbabilityAxis", "momentum15m"]);
    expect(templates).toHaveLength(
      buildCoarseProbabilityAxisDefinitions().length * MOMENTUM_BUCKET_DEFINITIONS.length,
    );
    expect(templates[0]?.bucketId).toBe("coarse-prob-0-momentum-strong-down");
  });

  it("matches momentum multi-axis buckets via matcher axes", () => {
    const observation = createObservation({ momentumPercent: 0.25 });
    const bucketId = "coarse-prob-1-momentum-moderate-up";

    expect(
      observationMatchesMultiAxisBucket(bucketId, observation, [
        "probability",
        "momentum",
      ]),
    ).toBe(true);
  });

  it("resolves volatility dimension buckets", () => {
    const dimension = getResearchDimension("volatility");
    expect(dimension.getBuckets()).toEqual(VOLATILITY_BUCKET_DEFINITIONS);
  });
});
