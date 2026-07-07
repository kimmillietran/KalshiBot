import { describe, expect, it } from "vitest";

import type { MispricingObservation } from "@/lib/data/research/mispricingAtlas/mispricingAtlasTypes";

import {
  assertResearchAxisGroupRegistryMatchesHypothesisGroups,
  buildCompositeBucketTemplates,
  getResearchAxisGroup,
  listResearchAxisGroups,
  observationMatchesResearchAxisGroupBucket,
  RESEARCH_AXIS_GROUPS,
  RESEARCH_DIMENSIONS,
} from "./index";
import {
  extractDayOfWeekUtc,
  extractHourUtc,
  extractSessionBucketCode,
  extractWeekendFlag,
  HOUR_UTC_BUCKET_DEFINITIONS,
} from "./temporalBucketDefinitions";

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
    timestampMs: Date.parse("2026-06-02T14:30:00.000Z"),
    ...overrides,
  };
}

describe("temporal research dimensions", () => {
  it("matches hypothesis atlas group ids exactly", () => {
    expect(() => assertResearchAxisGroupRegistryMatchesHypothesisGroups()).not.toThrow();
    expect(RESEARCH_AXIS_GROUPS).toHaveLength(24);
  });

  it("lists dimensions in deterministic order including temporal ids", () => {
    expect(RESEARCH_DIMENSIONS.map((dimension) => dimension.id)).toEqual([
      "probability",
      "coarseProbability",
      "coarseProbabilityAxis",
      "timeRemaining",
      "coarseTimeRemaining",
      "moneyness",
      "volatility",
      "momentum15m",
      "hourUtc",
      "dayOfWeekUtc",
      "sessionBucket",
      "weekendFlag",
    ]);
  });

  it("extracts UTC hour, day, session, and weekend at boundaries", () => {
    const sundayMorning = createObservation({
      timestampMs: Date.parse("2026-06-07T06:15:00.000Z"),
    });

    expect(extractHourUtc(sundayMorning)).toBe(6);
    expect(extractDayOfWeekUtc(sundayMorning)).toBe(0);
    expect(extractSessionBucketCode(sundayMorning)).toBe(1);
    expect(extractWeekendFlag(sundayMorning)).toBe(1);

    const mondayLate = createObservation({
      timestampMs: Date.parse("2026-06-08T23:45:00.000Z"),
    });
    expect(extractHourUtc(mondayLate)).toBe(23);
    expect(extractWeekendFlag(mondayLate)).toBe(0);
    expect(extractSessionBucketCode(mondayLate)).toBe(0);
  });

  it("builds probability-hour composite templates deterministically", () => {
    const templates = buildCompositeBucketTemplates(["coarseProbabilityAxis", "hourUtc"]);
    expect(templates[0]?.bucketId).toBe(
      `coarse-prob-0-${HOUR_UTC_BUCKET_DEFINITIONS[0]!.bucketId}`,
    );
    expect(templates.at(-1)?.bucketId).toContain("hour-utc-18-23");
  });

  it("matches probability-hour buckets through the registry matcher", () => {
    const observation = createObservation({
      predictedProbability: 0.35,
      timestampMs: Date.parse("2026-06-02T07:00:00.000Z"),
    });

    expect(
      observationMatchesResearchAxisGroupBucket({
        groupId: "probabilityHour",
        bucketId: "coarse-prob-1-hour-utc-6-11",
        observation,
      }),
    ).toBe(true);
  });

  it("matches momentum-hour buckets using momentum15m", () => {
    const observation = createObservation({
      momentumPercent: 0.25,
      timestampMs: Date.parse("2026-06-02T07:00:00.000Z"),
    });

    expect(getResearchAxisGroup("momentumHour").dimensionIds).toEqual([
      "momentum15m",
      "hourUtc",
    ]);
    expect(
      observationMatchesResearchAxisGroupBucket({
        groupId: "momentumHour",
        bucketId: "momentum-moderate-up-hour-utc-6-11",
        observation,
      }),
    ).toBe(true);
  });

  it("exposes temporal axis groups in registry order", () => {
    const groupIds = listResearchAxisGroups().map((group) => group.groupId);
    expect(groupIds).toContain("probabilityHour");
    expect(groupIds).toContain("momentumHour");
    expect(groupIds.indexOf("momentumHour")).toBeGreaterThan(groupIds.indexOf("momentum"));
    expect(getResearchAxisGroup("timeRemainingHour").dimensionIds).toEqual([
      "coarseTimeRemaining",
      "hourUtc",
    ]);
  });
});
