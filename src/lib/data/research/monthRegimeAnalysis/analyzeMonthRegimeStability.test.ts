import { describe, expect, it } from "vitest";

import type { HypothesisValidationEntry } from "@/lib/data/research/hypothesisRobustness/hypothesisRobustnessTypes";
import { createValidationBucketAccumulator } from "@/lib/data/research/hypothesisRobustness/validationBucketAccumulator";

import {
  analyzeMonthRegimeStability,
  monthRegimeCrossTabKey,
  type MonthRegimeCrossTab,
} from "./analyzeMonthRegimeStability";

const CONFIG = {
  minCalibrationError: 0.05,
  minPeriodObservations: 3,
};

function emptyStabilityMetrics(): Pick<
  HypothesisValidationEntry,
  "sampleConcentration" | "leaveOnePeriodOut"
> {
  return {
    sampleConcentration: {
      uniqueTradingDays: 10,
      largestContributingDay: null,
      largestDayObservations: 0,
      largestDayPercent: 0,
      singleDayDominated: false,
      scoreComponent: 0,
    },
    leaveOnePeriodOut: {
      folds: [],
      errorVariance: 0,
      errorStdDev: 0,
      scoreComponent: 0,
    },
  };
}

function createValidation(overrides: Partial<HypothesisValidationEntry>): HypothesisValidationEntry {
  return {
    hypothesisId: "atlas-probability-prob-70-80-over",
    hypothesis: "70-80% bucket overpricing",
    sourceArtifact: "mispricing-atlas.json",
    robustnessScore: 58,
    passes: false,
    reasons: ["month-regime-instability"],
    observationCount: 30,
    timeStability: {
      monthPeriods: [],
      quarterPeriods: [],
      monthPersistenceRate: 1,
      quarterPersistenceRate: 1,
      scoreComponent: 0,
    },
    regimeStability: {
      regimes: [],
      regimesWithEdge: 0,
      regimesWithData: 0,
      scoreComponent: 0,
    },
    ...emptyStabilityMetrics(),
    ...overrides,
  };
}

function addObservations(input: {
  count: number;
  implied: number;
  realized: number;
}): { count: number; sumPredicted: number; sumOutcome: number } {
  return {
    count: input.count,
    sumPredicted: input.implied * input.count,
    sumOutcome: input.realized * input.count,
  };
}

describe("analyzeMonthRegimeStability", () => {
  it("marks a stable hypothesis with persistent months across periods", () => {
    const validation = createValidation({
      timeStability: {
        monthPeriods: [
          {
            periodKey: "2025-12",
            observations: 10,
            signedCalibrationError: 0.12,
            edgeMatchesDirection: true,
          },
          {
            periodKey: "2026-01",
            observations: 10,
            signedCalibrationError: 0.1,
            edgeMatchesDirection: true,
          },
        ],
        quarterPeriods: [],
        monthPersistenceRate: 1,
        quarterPersistenceRate: 1,
        scoreComponent: 20,
      },
      regimeStability: {
        regimes: [
          {
            regime: "high",
            observations: 10,
            signedCalibrationError: 0.11,
            edgeMatchesDirection: true,
          },
        ],
        regimesWithEdge: 1,
        regimesWithData: 1,
        scoreComponent: 15,
      },
    });

    const analysis = analyzeMonthRegimeStability({
      validation,
      candidate: {
        candidateId: validation.hypothesisId,
        sourceArtifact: "mispricing-atlas.json",
        hypothesis: validation.hypothesis,
        rationale: "test",
        marketCondition: "test",
        suggestedStrategyFamily: "calibration-fade",
        requiredData: [],
        proposedEntryCondition: "edge",
        proposedExitSettlementAssumption: "settlement",
        expectedFailureMode: "regime",
        killCriterion: "edge gone",
        confidence: "medium",
        warnings: [],
      },
      accumulator: null,
      crossTab: null,
      config: CONFIG,
    });

    expect(analysis.summary.persistentMonths).toEqual(["2025-12", "2026-01"]);
    expect(analysis.summary.reversingMonths).toEqual([]);
    expect(analysis.summary.instabilityIndex).toBeLessThan(0.35);
    expect(analysis.monthExplanation).toContain("Dec 2025–Jan 2026");
  });

  it("marks an unstable hypothesis with reversing months", () => {
    const validation = createValidation({
      timeStability: {
        monthPeriods: [
          {
            periodKey: "2025-12",
            observations: 8,
            signedCalibrationError: 0.12,
            edgeMatchesDirection: true,
          },
          {
            periodKey: "2026-01",
            observations: 8,
            signedCalibrationError: 0.08,
            edgeMatchesDirection: true,
          },
          {
            periodKey: "2026-03",
            observations: 8,
            signedCalibrationError: -0.1,
            edgeMatchesDirection: false,
          },
          {
            periodKey: "2026-04",
            observations: 8,
            signedCalibrationError: -0.09,
            edgeMatchesDirection: false,
          },
        ],
        quarterPeriods: [],
        monthPersistenceRate: 0.5,
        quarterPersistenceRate: 0.5,
        scoreComponent: 8,
      },
      regimeStability: {
        regimes: [
          {
            regime: "high",
            observations: 8,
            signedCalibrationError: 0.11,
            edgeMatchesDirection: true,
          },
          {
            regime: "medium",
            observations: 8,
            signedCalibrationError: -0.08,
            edgeMatchesDirection: false,
          },
        ],
        regimesWithEdge: 1,
        regimesWithData: 2,
        scoreComponent: 8,
      },
    });

    const analysis = analyzeMonthRegimeStability({
      validation,
      candidate: null,
      accumulator: null,
      crossTab: null,
      config: CONFIG,
    });

    expect(analysis.summary.reversingMonths).toEqual(["2026-03", "2026-04"]);
    expect(analysis.summary.instabilityIndex).toBeGreaterThanOrEqual(0.35);
    expect(analysis.monthExplanation).toContain("reverses in Mar 2026–Apr 2026");
    expect(analysis.regimeExplanation).toContain("High volatility");
    expect(analysis.regimeExplanation).toContain("Medium volatility");
  });

  it("handles empty month and regime inputs", () => {
    const validation = createValidation({});

    const analysis = analyzeMonthRegimeStability({
      validation,
      candidate: null,
      accumulator: null,
      crossTab: null,
      config: CONFIG,
    });

    expect(analysis.months).toEqual([]);
    expect(analysis.regimes).toHaveLength(3);
    expect(analysis.summary.strongestMonth).toBeNull();
    expect(analysis.combinedDiagnostic).toContain("No volatility regime");
  });

  it("includes missing months with zero observations when validation lists them", () => {
    const validation = createValidation({
      timeStability: {
        monthPeriods: [
          {
            periodKey: "2025-12",
            observations: 0,
            signedCalibrationError: null,
            edgeMatchesDirection: false,
          },
          {
            periodKey: "2026-01",
            observations: 5,
            signedCalibrationError: 0.08,
            edgeMatchesDirection: true,
          },
        ],
        quarterPeriods: [],
        monthPersistenceRate: 1,
        quarterPersistenceRate: 1,
        scoreComponent: 10,
      },
    });

    const analysis = analyzeMonthRegimeStability({
      validation,
      candidate: null,
      accumulator: null,
      crossTab: null,
      config: CONFIG,
    });

    expect(analysis.months.map((month) => month.month)).toEqual(["2025-12", "2026-01"]);
    expect(analysis.months[0]?.edgeDirection).toBe("insufficient-data");
    expect(analysis.months[1]?.edgeDirection).toBe("supports");
  });

  it("detects regime reversal from accumulator-derived probabilities", () => {
    const validation = createValidation({
      timeStability: {
        monthPeriods: [],
        quarterPeriods: [],
        monthPersistenceRate: 0,
        quarterPersistenceRate: 0,
        scoreComponent: 0,
      },
      regimeStability: {
        regimes: [],
        regimesWithEdge: 1,
        regimesWithData: 2,
        scoreComponent: 0,
      },
    });

    const accumulator = createValidationBucketAccumulator({
      groupId: "probability",
      bucketId: "prob-70-80",
    });
    const high = addObservations({ count: 5, implied: 0.8, realized: 0.5 });
    const medium = addObservations({ count: 5, implied: 0.45, realized: 0.6 });
    accumulator.byRegime.set("high", high);
    accumulator.byRegime.set("medium", medium);

    const analysis = analyzeMonthRegimeStability({
      validation,
      candidate: {
        candidateId: "atlas-probability-prob-70-80-over",
        sourceArtifact: "mispricing-atlas.json",
        hypothesis: validation.hypothesis,
        rationale: "test",
        marketCondition: "test",
        suggestedStrategyFamily: "calibration-fade",
        requiredData: [],
        proposedEntryCondition: "edge",
        proposedExitSettlementAssumption: "settlement",
        expectedFailureMode: "regime",
        killCriterion: "edge gone",
        confidence: "medium",
        warnings: [],
      },
      accumulator,
      crossTab: null,
      config: CONFIG,
    });

    const highRegime = analysis.regimes.find((regime) => regime.regime === "high");
    const mediumRegime = analysis.regimes.find((regime) => regime.regime === "medium");
    expect(highRegime?.edgeDirection).toBe("supports");
    expect(mediumRegime?.edgeDirection).toBe("reverses");
    expect(analysis.regimeExplanation).toContain(
      "High volatility supports the edge while Medium volatility reverses it",
    );
  });

  it("produces deterministic output for identical inputs", () => {
    const validation = createValidation({
      timeStability: {
        monthPeriods: [
          {
            periodKey: "2025-12",
            observations: 6,
            signedCalibrationError: 0.07,
            edgeMatchesDirection: true,
          },
        ],
        quarterPeriods: [],
        monthPersistenceRate: 1,
        quarterPersistenceRate: 1,
        scoreComponent: 10,
      },
    });

    const crossTab: MonthRegimeCrossTab = new Map([
      [
        monthRegimeCrossTabKey("2025-12", "high"),
        addObservations({ count: 4, implied: 0.75, realized: 0.5 }),
      ],
    ]);

    const first = analyzeMonthRegimeStability({
      validation,
      candidate: null,
      accumulator: null,
      crossTab,
      config: CONFIG,
    });
    const second = analyzeMonthRegimeStability({
      validation,
      candidate: null,
      accumulator: null,
      crossTab,
      config: CONFIG,
    });

    expect(first).toEqual(second);
  });

  it("derives implied and realized probabilities from accumulator months", () => {
    const validation = createValidation({
      timeStability: {
        monthPeriods: [],
        quarterPeriods: [],
        monthPersistenceRate: 1,
        quarterPersistenceRate: 1,
        scoreComponent: 10,
      },
    });
    const accumulator = createValidationBucketAccumulator({
      groupId: "probability",
      bucketId: "prob-70-80",
    });
    accumulator.byMonth.set(
      "2025-12",
      addObservations({ count: 4, implied: 0.72, realized: 0.5 }),
    );

    const analysis = analyzeMonthRegimeStability({
      validation,
      candidate: {
        candidateId: "atlas-probability-prob-70-80-over",
        sourceArtifact: "mispricing-atlas.json",
        hypothesis: validation.hypothesis,
        rationale: "test",
        marketCondition: "test",
        suggestedStrategyFamily: "calibration-fade",
        requiredData: [],
        proposedEntryCondition: "edge",
        proposedExitSettlementAssumption: "settlement",
        expectedFailureMode: "regime",
        killCriterion: "edge gone",
        confidence: "medium",
        warnings: [],
      },
      accumulator,
      crossTab: null,
      config: CONFIG,
    });

    expect(analysis.months[0]?.averageImpliedProbability).toBe(0.72);
    expect(analysis.months[0]?.realizedProbability).toBe(0.5);
    expect(analysis.months[0]?.confidenceInterval).not.toBeNull();
  });
});
