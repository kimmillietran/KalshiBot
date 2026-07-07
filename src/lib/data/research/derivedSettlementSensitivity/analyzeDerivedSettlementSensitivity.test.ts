import { describe, expect, it } from "vitest";

import type { HypothesisValidationEntry } from "@/lib/data/research/hypothesisRobustness/hypothesisRobustnessTypes";

import {
  analyzeDerivedSettlementSensitivity,
  classifyDerivedSensitivityRecommendation,
} from "./analyzeDerivedSettlementSensitivity";

function createValidation(
  overrides: Partial<HypothesisValidationEntry> = {},
): HypothesisValidationEntry {
  return {
    hypothesisId: "hyp-a",
    hypothesis: "Test hypothesis",
    sourceArtifact: "mispricing-atlas.json",
    robustnessScore: 58,
    passes: false,
    reasons: [],
    observationCount: 100,
    timeStability: {
      monthPeriods: [],
      quarterPeriods: [],
      monthPersistenceRate: 0.3,
      quarterPersistenceRate: 0.5,
      scoreComponent: 10,
    },
    regimeStability: {
      regimes: [],
      regimesWithEdge: 0,
      regimesWithData: 0,
      scoreComponent: 0,
    },
    sampleConcentration: {
      uniqueTradingDays: 20,
      largestContributingDay: null,
      largestDayObservations: 0,
      largestDayPercent: 0,
      singleDayDominated: false,
      scoreComponent: 20,
    },
    leaveOnePeriodOut: {
      folds: [],
      errorVariance: 0,
      errorStdDev: 0.02,
      scoreComponent: 20,
    },
    ...overrides,
  };
}

describe("classifyDerivedSensitivityRecommendation", () => {
  it("classifies robust when derived share is zero", () => {
    expect(
      classifyDerivedSensitivityRecommendation({
        deltaRobustness: 0,
        derivedObservationShare: 0,
        officialObservationCount: 100,
        allObservationCount: 100,
      }),
    ).toBe("robust");
  });

  it("classifies dominated when derived share is high and robustness drops", () => {
    expect(
      classifyDerivedSensitivityRecommendation({
        deltaRobustness: -12,
        derivedObservationShare: 0.6,
        officialObservationCount: 40,
        allObservationCount: 100,
      }),
    ).toBe("dominated-by-derived-data");
  });

  it("classifies highly sensitive for large robustness drops", () => {
    expect(
      classifyDerivedSensitivityRecommendation({
        deltaRobustness: -18,
        derivedObservationShare: 0.2,
        officialObservationCount: 80,
        allObservationCount: 100,
      }),
    ).toBe("highly-sensitive");
  });
});

describe("analyzeDerivedSettlementSensitivity", () => {
  it("computes deltas and recommendation for affected hypotheses", () => {
    const entry = analyzeDerivedSettlementSensitivity({
      allValidation: createValidation({ robustnessScore: 58, observationCount: 553, passes: false }),
      officialValidation: createValidation({ robustnessScore: 44, observationCount: 427, passes: false }),
      allCalibration: 0.12,
      officialCalibration: 0.08,
    });

    expect(entry.deltaRobustness).toBe(-14);
    expect(entry.deltaCalibration).toBe(-0.04);
    expect(entry.allObservations.derivedObservationCount).toBe(126);
    expect(entry.recommendation).toBe("moderately-sensitive");
    expect(entry.notes.length).toBeGreaterThan(0);
  });

  it("marks robust when official-only metrics match all-data metrics", () => {
    const entry = analyzeDerivedSettlementSensitivity({
      allValidation: createValidation({ robustnessScore: 50, observationCount: 80 }),
      officialValidation: createValidation({ robustnessScore: 50, observationCount: 80 }),
      allCalibration: 0.1,
      officialCalibration: 0.1,
    });

    expect(entry.recommendation).toBe("robust");
    expect(entry.deltaRobustness).toBe(0);
  });
});
