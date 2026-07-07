import { describe, expect, it } from "vitest";

import type { MispricingAtlasBucketSummary } from "@/lib/data/research/mispricingAtlas/mispricingAtlasTypes";

import {
  computeBucketSparsity,
  computeCoverageQuality,
  computeInteractionScore,
  formatInteractionLabel,
  isNearPromisingHeuristic,
  normalizedBucketEntropy,
} from "./computeInteractionMetrics";

function bucket(
  observations: number,
  uniqueTradingDays: number | null = 8,
): MispricingAtlasBucketSummary {
  return {
    bucketId: `bucket-${observations}`,
    bucketLabel: `Bucket ${observations}`,
    observations,
    uniqueTradingDays,
    averageImpliedProbability: 0.7,
    realizedFrequency: 0.65,
    calibrationError: 0.05,
    brierScore: 0.2,
    averageAbsoluteError: 0.05,
  };
}

describe("computeInteractionMetrics", () => {
  it("returns zero entropy for empty or zero-count buckets", () => {
    expect(normalizedBucketEntropy([])).toBe(0);
    expect(normalizedBucketEntropy([bucket(0), bucket(0)])).toBe(0);
  });

  it("returns higher entropy for evenly distributed observations", () => {
    const uniform = normalizedBucketEntropy([bucket(10), bucket(10), bucket(10), bucket(10)]);
    const skewed = normalizedBucketEntropy([bucket(30), bucket(5), bucket(3), bucket(2)]);

    expect(uniform).toBeGreaterThan(skewed);
    expect(uniform).toBeLessThanOrEqual(1);
  });

  it("treats all-empty buckets as fully sparse", () => {
    expect(computeBucketSparsity([bucket(0), bucket(0)])).toBe(1);
    expect(computeBucketSparsity([bucket(5), bucket(0)])).toBe(0.5);
  });

  it("scores coverage quality from non-empty and thresholded buckets", () => {
    const quality = computeCoverageQuality({
      buckets: [bucket(20), bucket(0), bucket(5)],
      minSampleThreshold: 10,
    });

    expect(quality).toBeGreaterThan(0);
    expect(quality).toBeLessThanOrEqual(1);
  });

  it("ranks stronger interactions above weaker ones", () => {
    const strong = computeInteractionScore({
      passRate: 0.6,
      averageRobustness: 72,
      nearPromisingFrequency: 0.2,
      averageCalibrationError: 0.08,
      coverageQuality: 0.7,
      bucketSparsity: 0.1,
      entropy: 0.55,
    });
    const weak = computeInteractionScore({
      passRate: 0.1,
      averageRobustness: 30,
      nearPromisingFrequency: 0.05,
      averageCalibrationError: 0.02,
      coverageQuality: 0.2,
      bucketSparsity: 0.8,
      entropy: 0.9,
    });

    expect(strong).toBeGreaterThan(weak);
  });

  it("formats interaction labels without duplicate dimension names", () => {
    expect(formatInteractionLabel(["probability", "coarseProbability"])).toBe("Probability");
    expect(formatInteractionLabel(["probability", "momentum15m"])).toBe("Probability × Momentum");
  });

  it("detects near-promising candidates via robustness heuristic", () => {
    expect(
      isNearPromisingHeuristic({
        passes: false,
        robustnessScore: 58,
        passScoreThreshold: 70,
        nearPromisingRobustnessFloor: 50,
      }),
    ).toBe(true);
    expect(
      isNearPromisingHeuristic({
        passes: true,
        robustnessScore: 80,
        passScoreThreshold: 70,
        nearPromisingRobustnessFloor: 50,
      }),
    ).toBe(false);
  });
});
