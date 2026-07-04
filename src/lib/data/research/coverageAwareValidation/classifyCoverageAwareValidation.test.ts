import { describe, expect, it } from "vitest";

import type { HypothesisValidationEntry } from "@/lib/data/research/hypothesisRobustness/hypothesisRobustnessTypes";
import type { CrossValidationEntry } from "@/lib/data/research/crossValidation/crossValidationTypes";

import {
  classifyCoverageAwareValidation,
  recommendImportWindows,
} from "./classifyCoverageAwareValidation";

const THRESHOLDS = {
  minMonths: 3,
  minTradingDays: 8,
  minObservations: 6,
  minRegimesWithData: 2,
  minRobustnessScore: 70,
  promisingRobustnessFloor: 50,
};

function createValidation(
  overrides: Partial<HypothesisValidationEntry> = {},
): HypothesisValidationEntry {
  return {
    hypothesisId: "atlas-volatility-vol-high-over",
    hypothesis: "High vol overpriced",
    sourceArtifact: "mispricing-atlas.json",
    robustnessScore: 40,
    passes: false,
    reasons: ["Weak edge"],
    observationCount: 4,
    timeStability: {
      monthPeriods: [
        { periodKey: "2023-10", observations: 2, signedCalibrationError: 0.1, edgeMatchesDirection: true },
        { periodKey: "2023-11", observations: 2, signedCalibrationError: 0.08, edgeMatchesDirection: true },
      ],
      quarterPeriods: [],
      monthPersistenceRate: 0.5,
      quarterPersistenceRate: 0.5,
      scoreComponent: 10,
    },
    regimeStability: {
      regimes: [
        { regime: "low", observations: 0, signedCalibrationError: null, edgeMatchesDirection: false },
        { regime: "medium", observations: 2, signedCalibrationError: 0.1, edgeMatchesDirection: true },
        { regime: "high", observations: 2, signedCalibrationError: 0.12, edgeMatchesDirection: true },
      ],
      regimesWithEdge: 2,
      regimesWithData: 2,
      scoreComponent: 15,
    },
    sampleConcentration: {
      uniqueTradingDays: 4,
      largestContributingDay: "2023-10-01",
      largestDayObservations: 2,
      largestDayPercent: 50,
      singleDayDominated: false,
      scoreComponent: 10,
    },
    leaveOnePeriodOut: {
      folds: [],
      errorVariance: 0.01,
      errorStdDev: 0.1,
      scoreComponent: 5,
    },
    ...overrides,
  };
}

describe("classifyCoverageAwareValidation", () => {
  it("classifies sparse calendar coverage as inconclusive-insufficient-coverage", () => {
    const classification = classifyCoverageAwareValidation({
      validation: createValidation(),
      crossValidation: null,
      thresholds: THRESHOLDS,
    });

    expect(classification).toBe("inconclusive-insufficient-coverage");
  });

  it("classifies adequate coverage with weak edge as rejected", () => {
    const classification = classifyCoverageAwareValidation({
      validation: createValidation({
        observationCount: 12,
        robustnessScore: 45,
        passes: false,
        timeStability: {
          ...createValidation().timeStability,
          monthPeriods: [
            { periodKey: "2023-10", observations: 4, signedCalibrationError: 0.1, edgeMatchesDirection: true },
            { periodKey: "2023-11", observations: 4, signedCalibrationError: 0.05, edgeMatchesDirection: false },
            { periodKey: "2023-12", observations: 4, signedCalibrationError: 0.04, edgeMatchesDirection: false },
          ],
        },
        sampleConcentration: {
          uniqueTradingDays: 10,
          largestContributingDay: "2023-10-01",
          largestDayObservations: 2,
          largestDayPercent: 16,
          singleDayDominated: false,
          scoreComponent: 20,
        },
      }),
      crossValidation: null,
      thresholds: THRESHOLDS,
    });

    expect(classification).toBe("rejected");
  });

  it("classifies passing hypotheses with adequate coverage as robust-enough-to-test", () => {
    const classification = classifyCoverageAwareValidation({
      validation: createValidation({
        robustnessScore: 82,
        passes: true,
        observationCount: 15,
        timeStability: {
          ...createValidation().timeStability,
          monthPeriods: [
            { periodKey: "2023-10", observations: 5, signedCalibrationError: 0.1, edgeMatchesDirection: true },
            { periodKey: "2023-11", observations: 5, signedCalibrationError: 0.09, edgeMatchesDirection: true },
            { periodKey: "2023-12", observations: 5, signedCalibrationError: 0.08, edgeMatchesDirection: true },
          ],
          monthPersistenceRate: 1,
        },
        sampleConcentration: {
          uniqueTradingDays: 12,
          largestContributingDay: "2023-10-01",
          largestDayObservations: 2,
          largestDayPercent: 13,
          singleDayDominated: false,
          scoreComponent: 22,
        },
      }),
      crossValidation: null,
      thresholds: THRESHOLDS,
    });

    expect(classification).toBe("robust-enough-to-test");
  });

  it("recommends import windows from the historical coverage plan", () => {
    const windows = recommendImportWindows({
      classification: "inconclusive-insufficient-coverage",
      metrics: {
        observationCount: 4,
        uniqueTradingDays: 4,
        monthCount: 2,
        regimeCoverage: { regimesWithData: 2, regimesWithEdge: 1, sparseRegimes: ["low"] },
        robustnessScore: 40,
        largestDayPercent: 50,
        singleDayDominated: false,
        crossValidationPasses: null,
      },
      coveragePlan: {
        thresholds: THRESHOLDS,
        currentCoverage: {
          earliestTradingDayUtc: "2023-10-01",
          latestTradingDayUtc: "2023-11-30",
          uniqueTradingDays: 20,
          uniqueMonths: 2,
        },
        recommendedImportWindows: [
          {
            windowId: "dec-2023",
            label: "December 2023",
            startDate: "2023-12-01",
            endDate: "2023-12-31",
            rationale: "Extend month coverage",
            priority: "high",
          },
        ],
      },
    });

    expect(windows.some((window) => window.windowId === "dec-2023")).toBe(true);
    expect(windows.some((window) => window.windowId === "extend-calendar-months")).toBe(true);
  });
});

describe("regime-sparse classification", () => {
  it("classifies hypotheses with sparse regime coverage separately from calendar gaps", () => {
    const classification = classifyCoverageAwareValidation({
      validation: createValidation({
        observationCount: 12,
        timeStability: {
          ...createValidation().timeStability,
          monthPeriods: [
            { periodKey: "2023-10", observations: 4, signedCalibrationError: 0.1, edgeMatchesDirection: true },
            { periodKey: "2023-11", observations: 4, signedCalibrationError: 0.09, edgeMatchesDirection: true },
            { periodKey: "2023-12", observations: 4, signedCalibrationError: 0.08, edgeMatchesDirection: true },
          ],
        },
        regimeStability: {
          regimes: [
            { regime: "low", observations: 0, signedCalibrationError: null, edgeMatchesDirection: false },
            { regime: "medium", observations: 12, signedCalibrationError: 0.1, edgeMatchesDirection: true },
            { regime: "high", observations: 0, signedCalibrationError: null, edgeMatchesDirection: false },
          ],
          regimesWithEdge: 1,
          regimesWithData: 1,
          scoreComponent: 8,
        },
        sampleConcentration: {
          uniqueTradingDays: 10,
          largestContributingDay: "2023-10-01",
          largestDayObservations: 2,
          largestDayPercent: 16,
          singleDayDominated: false,
          scoreComponent: 20,
        },
      }),
      crossValidation: {
        targetId: "atlas-volatility-vol-high-over",
        targetType: "hypothesis",
        hypothesisId: "atlas-volatility-vol-high-over",
        overallPasses: false,
      } as CrossValidationEntry,
      thresholds: THRESHOLDS,
    });

    expect(classification).toBe("inconclusive-regime-sparse");
  });
});
