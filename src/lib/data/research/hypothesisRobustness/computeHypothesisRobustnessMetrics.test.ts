import { describe, expect, it } from "vitest";

import {
  computeLeaveOnePeriodOutMetrics,
  computeRegimeStabilityMetrics,
  computeRobustnessScore,
  computeSampleConcentrationMetrics,
  computeSignedCalibrationError,
  computeTimeStabilityMetrics,
} from "./computeHypothesisRobustnessMetrics";
import type { EnrichedMispricingObservation } from "./hypothesisRobustnessTypes";

const CONFIG = {
  passScoreThreshold: 70,
  minCalibrationError: 0.05,
  singleDayConcentrationFlag: 0.5,
  minPeriodObservations: 2,
};

function createObservation(
  overrides: Partial<EnrichedMispricingObservation> & Pick<EnrichedMispricingObservation, "stepIndex">,
): EnrichedMispricingObservation {
  return {
    strategyId: "strategy-a",
    seriesTicker: "KXBTC15M",
    marketTicker: "KXBTC15M-TEST",
    stepIndex: overrides.stepIndex,
    predictedProbability: overrides.predictedProbability ?? 0.7,
    observedOutcome: overrides.observedOutcome ?? 0,
    timeRemainingMs: overrides.timeRemainingMs ?? 600_000,
    moneynessPercent: overrides.moneynessPercent ?? 0,
    annualizedVolatility: overrides.annualizedVolatility ?? 0.5,
    timestampMs: overrides.timestampMs ?? 1_700_000_000_000,
    tradingDayUtc: overrides.tradingDayUtc ?? "2023-11-14",
    calendarMonth: overrides.calendarMonth ?? "2023-11",
    calendarQuarter: overrides.calendarQuarter ?? "2023-Q4",
    volatilityRegime: overrides.volatilityRegime ?? "medium",
  };
}

describe("computeHypothesisRobustnessMetrics", () => {
  it("computes signed calibration error as predicted minus realized average", () => {
    const observations = [
      createObservation({ stepIndex: 0, predictedProbability: 0.8, observedOutcome: 1 }),
      createObservation({ stepIndex: 1, predictedProbability: 0.6, observedOutcome: 0 }),
    ];

    expect(computeSignedCalibrationError(observations)).toBe(0.2);
  });

  it("scores stable multi-month overpriced hypotheses higher than single-day samples", () => {
    const stableObservations = [
      createObservation({
        stepIndex: 0,
        calendarMonth: "2023-10",
        calendarQuarter: "2023-Q4",
        tradingDayUtc: "2023-10-01",
        volatilityRegime: "low",
      }),
      createObservation({
        stepIndex: 1,
        calendarMonth: "2023-10",
        calendarQuarter: "2023-Q4",
        tradingDayUtc: "2023-10-02",
        volatilityRegime: "medium",
      }),
      createObservation({
        stepIndex: 2,
        calendarMonth: "2023-11",
        calendarQuarter: "2023-Q4",
        tradingDayUtc: "2023-11-01",
        volatilityRegime: "high",
      }),
      createObservation({
        stepIndex: 3,
        calendarMonth: "2023-11",
        calendarQuarter: "2023-Q4",
        tradingDayUtc: "2023-11-02",
        volatilityRegime: "medium",
      }),
    ];

    const concentratedObservations = [
      createObservation({ stepIndex: 0, tradingDayUtc: "2023-11-14" }),
      createObservation({ stepIndex: 1, tradingDayUtc: "2023-11-14" }),
      createObservation({ stepIndex: 2, tradingDayUtc: "2023-11-14" }),
      createObservation({ stepIndex: 3, tradingDayUtc: "2023-11-14" }),
    ];

    const stableScore = computeRobustnessScore({
      timeStability: computeTimeStabilityMetrics(stableObservations, "over", CONFIG),
      regimeStability: computeRegimeStabilityMetrics(stableObservations, "over", CONFIG),
      sampleConcentration: computeSampleConcentrationMetrics(stableObservations, CONFIG),
      leaveOnePeriodOut: computeLeaveOnePeriodOutMetrics(stableObservations, "over", CONFIG),
    });

    const concentratedScore = computeRobustnessScore({
      timeStability: computeTimeStabilityMetrics(concentratedObservations, "over", CONFIG),
      regimeStability: computeRegimeStabilityMetrics(concentratedObservations, "over", CONFIG),
      sampleConcentration: computeSampleConcentrationMetrics(concentratedObservations, CONFIG),
      leaveOnePeriodOut: computeLeaveOnePeriodOutMetrics(
        concentratedObservations,
        "over",
        CONFIG,
      ),
    });

    expect(stableScore).toBeGreaterThan(concentratedScore);
    expect(
      computeSampleConcentrationMetrics(concentratedObservations, CONFIG).singleDayDominated,
    ).toBe(true);
  });
});
