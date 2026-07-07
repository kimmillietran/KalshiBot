import { describe, expect, it } from "vitest";

import type { HypothesisFailureAnalysisEntry } from "@/lib/data/research/hypothesisFailureAnalysis/hypothesisFailureAnalysisTypes";
import type { HypothesisCandidate } from "@/lib/data/research/hypothesisCandidates/hypothesisCandidateTypes";
import type { HypothesisValidationEntry } from "@/lib/data/research/hypothesisRobustness/hypothesisRobustnessTypes";

import {
  aggregatePortfolioMetricsByAxisGroup,
  aggregatePortfolioMetricsByDimension,
  buildPortfolioHypothesisRecords,
} from "./aggregatePortfolioAnalytics";

function createCandidate(candidateId: string): HypothesisCandidate {
  return {
    candidateId,
    sourceArtifact: "mispricing-atlas.json",
    hypothesis: `${candidateId} hypothesis`,
    rationale: "test",
    marketCondition: "test",
    suggestedStrategyFamily: "calibration-no-fade",
    requiredData: ["mispricing-atlas"],
    proposedEntryCondition: "test",
    proposedExitSettlementAssumption: "settlement",
    expectedFailureMode: "noise",
    killCriterion: "stop",
    confidence: "medium",
    warnings: [],
  };
}

function createValidation(
  hypothesisId: string,
  robustnessScore: number,
  monthPersistenceRate: number,
): HypothesisValidationEntry {
  return {
    hypothesisId,
    hypothesis: `${hypothesisId} hypothesis`,
    sourceArtifact: "mispricing-atlas.json",
    robustnessScore,
    passes: robustnessScore >= 70,
    reasons: [],
    observationCount: 100,
    timeStability: {
      monthPeriods: [],
      quarterPeriods: [],
      monthPersistenceRate,
      quarterPersistenceRate: monthPersistenceRate,
      scoreComponent: 10,
    },
    regimeStability: {
      regimes: [],
      regimesWithEdge: 1,
      regimesWithData: 3,
      scoreComponent: 5,
    },
    sampleConcentration: {
      uniqueTradingDays: 20,
      largestContributingDay: "2026-01-01",
      largestDayObservations: 10,
      largestDayPercent: 10,
      singleDayDominated: false,
      scoreComponent: 20,
    },
    leaveOnePeriodOut: {
      folds: [],
      errorVariance: 0.001,
      errorStdDev: 0.02,
      scoreComponent: 20,
    },
  };
}

function createFailureAnalysis(
  hypothesisId: string,
  priorityCategory: HypothesisFailureAnalysisEntry["priorityCategory"],
  scoreGap: number,
): HypothesisFailureAnalysisEntry {
  return {
    hypothesisId,
    hypothesis: `${hypothesisId} hypothesis`,
    passes: false,
    robustnessScore: 70 - scoreGap,
    passThreshold: 70,
    scoreGap,
    observationCount: 100,
    uniqueTradingDays: 20,
    priorityRank: 1,
    priorityCategory,
    priorityScore: 100,
    recommendedNextAction: "inspect-month-breakdown",
    failureReasons: [
      {
        category: "below-pass-threshold",
        summary: "Below threshold",
        detail: null,
      },
    ],
    stabilityDiagnostics: {
      strongestMonths: [],
      weakestMonths: [],
      missingOrThinMonths: [],
      highConcentrationDays: [],
      signalBreadth: "mixed",
      monthPersistenceRate: 0.5,
      quarterPersistenceRate: 0.5,
      uniqueTradingDays: 20,
      monthCount: 4,
      leaveOnePeriodOutStdDev: 0.02,
      regimesWithData: 3,
      regimesWithEdge: 1,
    },
    marginalEvidenceNeeds: [],
    notes: [],
    suggestedStrategyFamily: "calibration-no-fade",
    coverageClassification: null,
    crossValidationPasses: false,
  };
}

describe("aggregatePortfolioAnalytics", () => {
  const candidates = [
    createCandidate(
      "atlas-probabilityMoneyness-coarse-prob-2-moneyness-near-below-over",
    ),
    createCandidate(
      "atlas-volatilityProbabilityTime-vol-high-coarse-prob-1-coarse-time-early-over",
    ),
  ];

  const validations = [
    createValidation(
      "atlas-probabilityMoneyness-coarse-prob-2-moneyness-near-below-over",
      58,
      0.33,
    ),
    createValidation(
      "atlas-volatilityProbabilityTime-vol-high-coarse-prob-1-coarse-time-early-over",
      59,
      0.6,
    ),
  ];

  const failureAnalyses = [
    createFailureAnalysis(
      "atlas-probabilityMoneyness-coarse-prob-2-moneyness-near-below-over",
      "near-promising",
      12,
    ),
    createFailureAnalysis(
      "atlas-volatilityProbabilityTime-vol-high-coarse-prob-1-coarse-time-early-over",
      "near-promising",
      11,
    ),
  ];

  it("builds portfolio records for atlas hypotheses", () => {
    const records = buildPortfolioHypothesisRecords({
      candidates,
      validations,
      failureAnalyses,
    });

    expect(records).toHaveLength(2);
    expect(records[0]?.groupId).toBe("probabilityMoneyness");
    expect(records[0]?.dimensionIds).toEqual(["coarseProbabilityAxis", "moneyness"]);
  });

  it("aggregates axis group metrics", () => {
    const records = buildPortfolioHypothesisRecords({
      candidates,
      validations,
      failureAnalyses,
    });

    const axisGroups = aggregatePortfolioMetricsByAxisGroup({
      records,
      candidates,
      passScoreThreshold: 70,
    });

    const probabilityMoneyness = axisGroups.find(
      (entry) => entry.groupId === "probabilityMoneyness",
    );

    expect(probabilityMoneyness?.candidateCount).toBe(1);
    expect(probabilityMoneyness?.validationCount).toBe(1);
    expect(probabilityMoneyness?.passCount).toBe(0);
    expect(probabilityMoneyness?.averageRobustness).toBe(58);
    expect(probabilityMoneyness?.nearPromisingCount).toBe(1);
    expect(probabilityMoneyness?.averageScoreGap).toBe(12);
    expect(probabilityMoneyness?.failureReasonHistogram).toEqual([
      { category: "below-pass-threshold", count: 1 },
    ]);
  });

  it("attributes dimension metrics across participating dimensions", () => {
    const records = buildPortfolioHypothesisRecords({
      candidates,
      validations,
      failureAnalyses,
    });

    const dimensions = aggregatePortfolioMetricsByDimension({
      records,
      candidates,
      passScoreThreshold: 70,
    });

    const moneyness = dimensions.find((entry) => entry.dimensionId === "moneyness");
    const volatility = dimensions.find((entry) => entry.dimensionId === "volatility");

    expect(moneyness?.candidateCount).toBe(1);
    expect(moneyness?.validationCount).toBe(1);
    expect(volatility?.candidateCount).toBe(1);
    expect(volatility?.validationCount).toBe(1);
    expect(moneyness?.averageMonthInstability).toBeCloseTo(0.67, 2);
  });
});
