import { describe, expect, it } from "vitest";

import {
  collectMispricingAtlasBucketGroups,
  computeMispricingAtlasCoverageDiagnostics,
} from "./computeMispricingAtlasCoverage";
import { computeCoarseMispricingBucketSummaries } from "./computeMispricingBucketMetrics";
import type { MispricingAtlasBucketSummary } from "./mispricingAtlasTypes";

function createBucket(
  bucketId: string,
  observations: number,
): MispricingAtlasBucketSummary {
  return {
    bucketId,
    bucketLabel: bucketId,
    observations,
    averageImpliedProbability: observations > 0 ? 0.6 : null,
    realizedFrequency: observations > 0 ? 0.5 : null,
    calibrationError: observations > 0 ? 0.1 : null,
    brierScore: observations > 0 ? 0.2 : null,
    averageAbsoluteError: observations > 0 ? 0.1 : null,
  };
}

describe("computeMispricingAtlasCoverageDiagnostics", () => {
  it("summarizes bucket coverage and skip reasons", () => {
    const coarseBuckets = computeCoarseMispricingBucketSummaries([]);
    const diagnostics = computeMispricingAtlasCoverageDiagnostics({
      bucketGroups: collectMispricingAtlasBucketGroups({
        probabilityBuckets: [createBucket("prob-0", 12), createBucket("prob-1", 0)],
        timeRemainingBuckets: [createBucket("time-0-5m", 8)],
        moneynessBuckets: [createBucket("moneyness-near-below", 0)],
        volatilityBuckets: [createBucket("vol-high", 20)],
        coarseBuckets,
      }),
      sampleCounts: {
        totalObservations: 40,
        marketCount: 5,
        skippedMissingSettlement: 2,
        skippedMissingProbability: 1,
        skippedMissingContext: 0,
      },
      minSampleThreshold: 30,
    });

    expect(diagnostics.totalAtlasObservations).toBe(40);
    expect(diagnostics.nonEmptyBuckets).toBeGreaterThan(0);
    expect(diagnostics.bucketsBelowMinSampleThreshold).toBeGreaterThan(0);
    expect(diagnostics.largestBucketObservations).toBeGreaterThanOrEqual(20);
    expect(diagnostics.skipReasons.missingSettlement).toBe(2);
    expect(diagnostics.topBucketsBySampleSize[0]?.observations).toBe(
      diagnostics.largestBucketObservations,
    );
  });

  it("returns deterministic top bucket ordering", () => {
    const coarseBuckets = computeCoarseMispricingBucketSummaries([]);
    const input = {
      bucketGroups: collectMispricingAtlasBucketGroups({
        probabilityBuckets: [createBucket("prob-0", 15), createBucket("prob-1", 25)],
        timeRemainingBuckets: [],
        moneynessBuckets: [],
        volatilityBuckets: [],
        coarseBuckets,
      }),
      sampleCounts: {
        totalObservations: 40,
        marketCount: 2,
        skippedMissingSettlement: 0,
        skippedMissingProbability: 0,
        skippedMissingContext: 0,
      },
      minSampleThreshold: 30,
    };

    const first = computeMispricingAtlasCoverageDiagnostics(input);
    const second = computeMispricingAtlasCoverageDiagnostics(input);

    expect(first).toEqual(second);
    expect(first.topBucketsBySampleSize[0]?.bucketId).toBe("prob-1");
  });
});
