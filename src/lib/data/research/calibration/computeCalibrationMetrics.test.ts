import { describe, expect, it } from "vitest";

import {
  buildCalibrationBins,
  computeBrierScore,
  computeExpectedCalibrationError,
  computeLogLoss,
} from "./computeCalibrationMetrics";
import type { CalibrationObservation } from "./calibrationTypes";

function observation(
  predictedProbability: number,
  observedOutcome: 0 | 1,
): Pick<CalibrationObservation, "predictedProbability" | "observedOutcome"> {
  return { predictedProbability, observedOutcome };
}

describe("computeCalibrationMetrics", () => {
  it("computes Brier score as mean squared error", () => {
    const score = computeBrierScore([
      observation(0.8, 1),
      observation(0.2, 0),
      observation(0.6, 1),
    ]);

    expect(score).toBeCloseTo(0.08, 5);
  });

  it("returns null Brier score for empty observations", () => {
    expect(computeBrierScore([])).toBeNull();
  });

  it("computes log loss with probability clamping", () => {
    const score = computeLogLoss([
      observation(0.9, 1),
      observation(0.1, 0),
    ]);

    expect(score).toBeCloseTo(0.105361, 5);
  });

  it("builds equal-width calibration bins with observed frequency", () => {
    const bins = buildCalibrationBins(
      [
        observation(0.05, 0),
        observation(0.15, 0),
        observation(0.55, 1),
        observation(0.95, 1),
      ],
      10,
    );

    expect(bins).toHaveLength(10);
    expect(bins[0]?.sampleCount).toBe(1);
    expect(bins[0]?.averagePredictedProbability).toBe(0.05);
    expect(bins[0]?.observedSettlementFrequency).toBe(0);
    expect(bins[1]?.sampleCount).toBe(1);
    expect(bins[1]?.observedSettlementFrequency).toBe(0);
    expect(bins[5]?.sampleCount).toBe(1);
    expect(bins[5]?.observedSettlementFrequency).toBe(1);
    expect(bins[9]?.sampleCount).toBe(1);
    expect(bins[9]?.observedSettlementFrequency).toBe(1);
    expect(bins[2]?.averagePredictedProbability).toBeNull();
  });

  it("computes expected calibration error from bins", () => {
    const bins = buildCalibrationBins(
      [
        observation(0.05, 0),
        observation(0.15, 0),
        observation(0.55, 1),
        observation(0.95, 1),
      ],
      10,
    );

    const ece = computeExpectedCalibrationError(bins, 4);
    expect(ece).not.toBeNull();
    expect(ece).toBeGreaterThan(0);
  });
});
