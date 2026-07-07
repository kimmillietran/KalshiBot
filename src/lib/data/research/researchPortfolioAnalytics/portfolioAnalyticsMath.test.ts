import { describe, expect, it } from "vitest";

import {
  buildFailureReasonHistogram,
  buildRobustnessDistribution,
  computeMean,
  computeMedian,
  computeMonthInstability,
  computePassRate,
  computeRegimeInstability,
  resolveRobustnessDistributionBucketId,
} from "./portfolioAnalyticsMath";

describe("portfolioAnalyticsMath", () => {
  it("computes median for odd and even length arrays", () => {
    expect(computeMedian([10, 30, 20])).toBe(20);
    expect(computeMedian([10, 20, 30, 40])).toBe(25);
    expect(computeMedian([])).toBeNull();
  });

  it("computes pass rate", () => {
    expect(computePassRate(2, 4)).toBe(0.5);
    expect(computePassRate(0, 0)).toBeNull();
  });

  it("maps robustness scores to distribution buckets", () => {
    expect(resolveRobustnessDistributionBucketId(20)).toBe("0-34");
    expect(resolveRobustnessDistributionBucketId(45)).toBe("35-49");
    expect(resolveRobustnessDistributionBucketId(55)).toBe("50-59");
    expect(resolveRobustnessDistributionBucketId(65)).toBe("60-69");
    expect(resolveRobustnessDistributionBucketId(80)).toBe("70-100");
  });

  it("builds robustness distribution counts", () => {
    expect(buildRobustnessDistribution([34, 45, 55, 65, 80])).toEqual([
      { bucketId: "0-34", count: 1 },
      { bucketId: "35-49", count: 1 },
      { bucketId: "50-59", count: 1 },
      { bucketId: "60-69", count: 1 },
      { bucketId: "70-100", count: 1 },
    ]);
  });

  it("builds sorted failure reason histogram", () => {
    expect(
      buildFailureReasonHistogram([
        "poor-month-stability",
        "below-pass-threshold",
        "poor-month-stability",
      ]),
    ).toEqual([
      { category: "below-pass-threshold", count: 1 },
      { category: "poor-month-stability", count: 2 },
    ]);
  });

  it("derives instability metrics", () => {
    expect(computeMonthInstability(0.6)).toBe(0.4);
    expect(
      computeRegimeInstability({ regimesWithData: 3, regimesWithEdge: 1 }),
    ).toBeCloseTo(0.666667, 5);
    expect(computeRegimeInstability({ regimesWithData: 0, regimesWithEdge: 0 })).toBeNull();
    expect(computeMean([10, 20, 30])).toBe(20);
  });
});
