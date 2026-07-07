import { describe, expect, it } from "vitest";

import type { MispricingAtlas } from "@/lib/data/research/mispricingAtlas/mispricingAtlasTypes";

import { serializeTemporalCalibrationHeatmapHtml } from "./serializeTemporalCalibrationHeatmapHtml";

function createAtlas(overrides: Partial<MispricingAtlas> = {}): MispricingAtlas {
  return {
    generatedAt: "2026-06-02T00:00:00.000Z",
    inputRoot: "data/research-results",
    outputPath: "data/research-results/mispricing-atlas.json",
    sampleCounts: {
      totalObservations: 10,
      marketCount: 1,
      skippedMissingSettlement: 0,
      skippedMissingProbability: 0,
      skippedMissingContext: 0,
    },
    overallCalibration: {
      bucketId: "overall",
      bucketLabel: "Overall calibration",
      observations: 10,
      averageImpliedProbability: 0.5,
      realizedFrequency: 0.5,
      calibrationError: 0,
      brierScore: 0.25,
      averageAbsoluteError: 0.5,
    },
    probabilityBuckets: [],
    timeRemainingBuckets: [],
    moneynessBuckets: [],
    volatilityBuckets: [],
    momentumBuckets: [],
    hourUtcBuckets: [
      {
        bucketId: "hour-utc-6-11",
        bucketLabel: "06:00–11:59 UTC",
        observations: 5,
        calibrationError: 0.08,
        averageImpliedProbability: 0.55,
        realizedFrequency: 0.47,
        brierScore: 0.24,
        averageAbsoluteError: 0.45,
      },
    ],
    coarseBuckets: {
      probabilityOnly: [],
      probabilityTime: [],
      probabilityRegime: [],
      probabilityMoneyness: [],
      moneynessTime: [],
      volatilityMoneyness: [],
      volatilityProbabilityTime: [],
      probabilityMomentum: [],
      momentumTime: [],
      momentumVolatility: [],
      probabilityMomentumTime: [],
      probabilityHour: [],
      probabilityWeekday: [],
      momentumHour: [],
      timeRemainingHour: [],
    },
    warnings: [],
    ...overrides,
  };
}

describe("serializeTemporalCalibrationHeatmapHtml", () => {
  it("renders temporal group sections from registry bucket groups", () => {
    const html = serializeTemporalCalibrationHeatmapHtml(createAtlas());

    expect(html).toContain("Temporal calibration heatmaps");
    expect(html).toContain("hourUtc");
    expect(html).toContain("hour-utc-6-11");
    expect(html).toContain("+8.0%");
  });

  it("shows empty-state when no temporal buckets exist", () => {
    const html = serializeTemporalCalibrationHeatmapHtml(
      createAtlas({ hourUtcBuckets: [] }),
    );

    expect(html).toContain("No temporal bucket groups available.");
  });
});
