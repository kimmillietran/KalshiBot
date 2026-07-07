import { describe, expect, it } from "vitest";

import type { HypothesisCandidate } from "@/lib/data/research/hypothesisCandidates/hypothesisCandidateTypes";
import type { HypothesisFailureAnalysisEntry } from "@/lib/data/research/hypothesisFailureAnalysis/hypothesisFailureAnalysisTypes";
import type { HypothesisRefinementCandidate } from "@/lib/data/research/hypothesisRefinementGenerator/hypothesisRefinementTypes";
import type { HypothesisValidationEntry } from "@/lib/data/research/hypothesisRobustness/hypothesisRobustnessTypes";
import { createEmptyMispricingAtlasCoarseBuckets } from "@/lib/data/research/hypothesisCandidates/normalizeMispricingAtlas";

import { computeResearchRoiMetrics } from "./computeResearchRoiMetrics";
import { resolveResearchDimensionsFromGroupId } from "./resolveResearchDimensionsFromGroupId";

function createCandidate(
  candidateId: string,
  overrides: Partial<HypothesisCandidate> = {},
): HypothesisCandidate {
  return {
    candidateId,
    sourceArtifact: "mispricing-atlas.json",
    hypothesis: "Test hypothesis",
    rationale: "Test rationale",
    marketCondition: "Test condition",
    suggestedStrategyFamily: "calibration-fade",
    requiredData: ["research-output.json"],
    proposedEntryCondition: "Enter when edge exceeds threshold",
    proposedExitSettlementAssumption: "Hold to settlement",
    expectedFailureMode: "Regime shift",
    killCriterion: "Edge disappears",
    confidence: "medium",
    warnings: [],
    ...overrides,
  };
}

function createValidation(
  hypothesisId: string,
  options: { passes: boolean; robustnessScore: number },
): HypothesisValidationEntry {
  return {
    hypothesisId,
    hypothesis: "Test hypothesis",
    sourceArtifact: "mispricing-atlas.json",
    robustnessScore: options.robustnessScore,
    passes: options.passes,
    reasons: [],
    observationCount: 40,
    timeStability: {
      monthPeriods: [],
      quarterPeriods: [],
      monthPersistenceRate: 0.8,
      quarterPersistenceRate: 0.8,
      scoreComponent: 20,
    },
    regimeStability: {
      regimes: [],
      regimesWithEdge: 2,
      regimesWithData: 3,
      scoreComponent: 20,
    },
    sampleConcentration: {
      uniqueTradingDays: 10,
      largestContributingDay: "2023-10-01",
      largestDayObservations: 5,
      largestDayPercent: 0.12,
      singleDayDominated: false,
      scoreComponent: 20,
    },
    leaveOnePeriodOut: {
      errorStdDev: 0.02,
      folds: [],
      scoreComponent: 20,
    },
  };
}

function createFailureAnalysis(
  hypothesisId: string,
  priorityCategory: HypothesisFailureAnalysisEntry["priorityCategory"],
): HypothesisFailureAnalysisEntry {
  return {
    hypothesisId,
    hypothesis: "Test hypothesis",
    passes: false,
    robustnessScore: 55,
    passThreshold: 70,
    scoreGap: 15,
    observationCount: 40,
    uniqueTradingDays: 10,
    priorityRank: 1,
    priorityCategory,
    priorityScore: 80,
    recommendedNextAction: "collect-more-data",
    failureReasons: [],
    stabilityDiagnostics: {
      strongestMonths: [],
      weakestMonths: [],
      missingOrThinMonths: [],
      highConcentrationDays: [],
      signalBreadth: "mixed",
      monthPersistenceRate: 0.8,
      quarterPersistenceRate: 0.8,
      uniqueTradingDays: 10,
      monthCount: 3,
      leaveOnePeriodOutStdDev: 0.02,
      regimesWithData: 3,
      regimesWithEdge: 2,
    },
    marginalEvidenceNeeds: [],
    notes: [],
    suggestedStrategyFamily: "calibration-fade",
    coverageClassification: null,
    crossValidationPasses: null,
  };
}

function createRefinement(
  parentHypothesisId: string,
  parentRobustnessScore: number,
): HypothesisRefinementCandidate {
  return {
    refinementId: `refinement-${parentHypothesisId}`,
    parentHypothesisId,
    parentHypothesis: "Parent hypothesis",
    refinementType: "time-bucket-split",
    refinedHypothesis: "Refined hypothesis",
    rationale: "Split by time bucket",
    expectedBenefit: "Better stability",
    expectedRisk: "Smaller sample",
    overfittingRisk: "medium",
    priorityRank: 1,
    priorityScore: 80,
    status: "candidate-refinement",
    parentPriorityCategory: "near-promising",
    parentRobustnessScore,
    parentScoreGap: 15,
    suggestedFilters: { timeBucketId: "coarse-time-early" },
    atlasSupportObservations: 35,
  };
}

describe("resolveResearchDimensionsFromGroupId", () => {
  it("maps momentum axis groups to momentum dimensions", () => {
    expect(resolveResearchDimensionsFromGroupId("momentum")).toEqual(["momentum"]);
    expect(resolveResearchDimensionsFromGroupId("probabilityMomentumTime")).toEqual([
      "probability",
      "momentum",
      "time",
    ]);
  });

  it("derives ROI dimensions from canonical registry axis groups", () => {
    expect(resolveResearchDimensionsFromGroupId("probabilityHour")).toEqual([
      "probability",
      "time",
    ]);
    expect(resolveResearchDimensionsFromGroupId("probabilityRegime")).toEqual([
      "probability",
      "regime",
    ]);
  });
});

describe("computeResearchRoiMetrics", () => {
  it("computes overall efficiency and dimension rankings from artifacts", () => {
    const candidates = [
      createCandidate("atlas-volatility-vol-high-over"),
      createCandidate("atlas-momentum-momentum-moderate-up-over"),
      createCandidate("atlas-probability-prob-5-under"),
      createCandidate("lead-lag-aggregate-lag-1-over"),
    ];
    const validations = [
      createValidation("atlas-volatility-vol-high-over", {
        passes: true,
        robustnessScore: 82,
      }),
      createValidation("atlas-momentum-momentum-moderate-up-over", {
        passes: false,
        robustnessScore: 58,
      }),
      createValidation("atlas-probability-prob-5-under", {
        passes: false,
        robustnessScore: 45,
      }),
      createValidation("lead-lag-aggregate-lag-1-over", {
        passes: false,
        robustnessScore: 30,
      }),
    ];
    const failureAnalyses = [
      createFailureAnalysis("atlas-momentum-momentum-moderate-up-over", "near-promising"),
      createFailureAnalysis("atlas-probability-prob-5-under", "needs-more-data"),
    ];
    const refinements = [
      createRefinement("atlas-momentum-momentum-moderate-up-over", 58),
    ];

    const atlas = {
      generatedAt: "2026-06-27T18:00:00.000Z",
      inputRoot: "data/research-results",
      outputPath: "data/research-results/mispricing-atlas.json",
      sampleCounts: {
        totalObservations: 100,
        marketCount: 5,
        skippedMissingSettlement: 0,
        skippedMissingProbability: 0,
        skippedMissingContext: 0,
      },
      overallCalibration: {
        bucketId: "overall",
        bucketLabel: "Overall",
        observations: 100,
        averageImpliedProbability: 0.5,
        realizedFrequency: 0.5,
        calibrationError: 0,
        brierScore: 0.1,
        averageAbsoluteError: 0.1,
      },
      probabilityBuckets: [
        {
          bucketId: "prob-5",
          bucketLabel: "50-60%",
          observations: 20,
          averageImpliedProbability: 0.55,
          realizedFrequency: 0.5,
          calibrationError: 0.05,
          brierScore: 0.1,
          averageAbsoluteError: 0.1,
        },
      ],
      timeRemainingBuckets: [],
      moneynessBuckets: [],
      volatilityBuckets: [
        {
          bucketId: "vol-high",
          bucketLabel: "High vol",
          observations: 30,
          averageImpliedProbability: 0.6,
          realizedFrequency: 0.5,
          calibrationError: 0.1,
          brierScore: 0.1,
          averageAbsoluteError: 0.1,
        },
      ],
      momentumBuckets: [
        {
          bucketId: "momentum-moderate-up",
          bucketLabel: "Moderate Up",
          observations: 25,
          averageImpliedProbability: 0.58,
          realizedFrequency: 0.5,
          calibrationError: 0.08,
          brierScore: 0.1,
          averageAbsoluteError: 0.1,
        },
      ],
      coarseBuckets: createEmptyMispricingAtlasCoarseBuckets(),
      warnings: [],
    };

    const summary = computeResearchRoiMetrics({
      candidates,
      validations,
      failureAnalyses,
      refinements,
      mispricingAtlas: atlas,
      emptyInputReasons: [],
    });

    expect(summary.overall.totalCandidates).toBe(4);
    expect(summary.overall.validatedCandidates).toBe(1);
    expect(summary.overall.nearPromisingCandidates).toBe(1);
    expect(summary.overall.validationRate).toBe(0.25);
    expect(summary.overall.nearPromisingRate).toBe(0.25);
    expect(summary.overall.totalAtlasBuckets).toBeGreaterThan(0);
    expect(summary.rankings.highestRoiDimensions.length).toBeGreaterThan(0);
    expect(summary.rankings.highestRoiAxisGroups.some((slice) => slice.id === "volatility")).toBe(
      true,
    );
    expect(summary.dimensionMetrics.find((slice) => slice.id === "momentum")?.nearPromisingCount).toBe(
      1,
    );
  });

  it("records empty input reasons when artifacts are missing", () => {
    const summary = computeResearchRoiMetrics({
      candidates: [],
      validations: [],
      failureAnalyses: [],
      refinements: [],
      mispricingAtlas: null,
      emptyInputReasons: ["hypothesis-candidates.json was not found"],
    });

    expect(summary.overall.totalCandidates).toBe(0);
    expect(summary.emptyInputReasons).toContain("hypothesis-candidates.json was not found");
  });
});
