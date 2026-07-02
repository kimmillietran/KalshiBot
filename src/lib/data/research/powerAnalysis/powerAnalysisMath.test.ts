import { describe, expect, it } from "vitest";

import {
  computeMeanConfidenceInterval95,
  computeMinimumDetectableEffect,
  computeRequiredSampleSize,
  sampleStandardDeviation,
  sampleVariance,
} from "./powerAnalysisMath";

describe("powerAnalysisMath", () => {
  it("computes required sample size for a target edge", () => {
    const required = computeRequiredSampleSize({
      edgeCents: 2,
      standardDeviation: 10,
      alpha: 0.05,
      targetPower: 0.8,
    });

    expect(required).toBe(155);
  });

  it("computes minimum detectable effect from sample size and variance", () => {
    const mde = computeMinimumDetectableEffect({
      sampleSize: 100,
      standardDeviation: 10,
      alpha: 0.05,
      targetPower: 0.8,
    });

    expect(mde).toBeCloseTo(2.487, 2);
  });

  it("derives variance and 95% confidence intervals from samples", () => {
    const values = [1, 3, 5, 7, 9];
    expect(sampleVariance(values)).toBe(10);
    expect(sampleStandardDeviation(values)).toBeCloseTo(3.162278, 5);

    const interval = computeMeanConfidenceInterval95(values);
    expect(interval).not.toBeNull();
    expect(interval!.lower).toBeLessThan(5);
    expect(interval!.upper).toBeGreaterThan(5);
  });
});
