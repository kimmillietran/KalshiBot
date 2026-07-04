import { describe, expect, it } from "vitest";

import type { EnrichedMispricingObservation } from "@/lib/data/research/hypothesisRobustness/hypothesisRobustnessTypes";

import {
  computeAllCrossValidationMethods,
  computeLeaveOneMonthOutCrossValidation,
  computeRollingWindowCrossValidation,
} from "./computeCrossValidationMetrics";
import type { CrossValidationConfig } from "./crossValidationTypes";

const CONFIG: CrossValidationConfig = {
  rollingWindowMonths: 2,
  bootstrapIterations: 20,
  bootstrapSeed: 42,
  minPeriodObservations: 2,
  minCalibrationError: 0.05,
  maxErrorStdDev: 0.2,
  minPersistenceRate: 0.5,
};

function createObservation(
  stepIndex: number,
  overrides: Partial<EnrichedMispricingObservation> = {},
): EnrichedMispricingObservation {
  return {
    strategyId: "strategy-a",
    seriesTicker: "KXBTC15M",
    marketTicker: "KXBTC15M-TEST",
    stepIndex,
    predictedProbability: 0.75,
    observedOutcome: 0,
    timeRemainingMs: 900_000,
    moneynessPercent: 0,
    annualizedVolatility: 0.8,
    timestampMs: 1_700_000_000_000 + stepIndex * 86_400_000,
    tradingDayUtc: stepIndex < 2 ? "2023-10-01" : stepIndex < 4 ? "2023-10-02" : "2023-11-01",
    calendarMonth: stepIndex < 4 ? "2023-10" : "2023-11",
    calendarQuarter: "2023-Q4",
    volatilityRegime: stepIndex % 3 === 0 ? "low" : stepIndex % 3 === 1 ? "medium" : "high",
    ...overrides,
  };
}

describe("computeCrossValidationMetrics", () => {
  const observations = [
    createObservation(0),
    createObservation(1),
    createObservation(2),
    createObservation(3),
    createObservation(4),
    createObservation(5),
  ];

  it("computes rolling window folds across consecutive months", () => {
    const result = computeRollingWindowCrossValidation(observations, "over", CONFIG);

    expect(result.method).toBe("rollingWindow");
    expect(result.folds).toHaveLength(1);
    expect(result.folds[0]?.foldKey).toBe("2023-10..2023-11");
    expect(result.observationCount).toBe(6);
    expect(result.calibrationError).not.toBeNull();
    expect(result.stabilityMetrics.totalFoldCount).toBe(1);
  });

  it("reuses leave-one-month-out calibration folds", () => {
    const result = computeLeaveOneMonthOutCrossValidation(observations, "over", CONFIG);

    expect(result.folds.map((fold) => fold.foldKey)).toEqual(["2023-10", "2023-11"]);
    expect(result.folds.every((fold) => fold.observationCount > 0)).toBe(true);
  });

  it("runs all configured validation methods deterministically", () => {
    const first = computeAllCrossValidationMethods(observations, "over", CONFIG);
    const second = computeAllCrossValidationMethods(observations, "over", CONFIG);

    expect(Object.keys(first).sort()).toEqual([
      "expandingWindow",
      "leaveOneMonthOut",
      "leaveOneRegimeOut",
      "randomBootstrap",
      "rollingWindow",
    ]);
    expect(first.randomBootstrap.folds).toHaveLength(CONFIG.bootstrapIterations);
    expect(first).toEqual(second);
  });
});
