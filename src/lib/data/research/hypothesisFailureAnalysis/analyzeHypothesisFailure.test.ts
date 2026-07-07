import { describe, expect, it } from "vitest";

import type { HypothesisValidationEntry } from "@/lib/data/research/hypothesisRobustness/hypothesisRobustnessTypes";

import {
  analyzeHypothesisFailure,
  classifyHypothesisPriorityCategory,
  computeHypothesisPriorityScore,
  rankHypothesisFailureAnalyses,
  resolveRecommendedNextAction,
} from "./analyzeHypothesisFailure";

function createValidation(
  overrides: Partial<HypothesisValidationEntry> = {},
): HypothesisValidationEntry {
  return {
    hypothesisId: "hyp-a",
    hypothesis: "Test hypothesis appears overconfident.",
    sourceArtifact: "mispricing-atlas.json",
    robustnessScore: 58,
    passes: false,
    reasons: [
      "Month-level edge persistence is weak (33%).",
      "Robustness score 58 is below promotion threshold (70).",
    ],
    observationCount: 553,
    timeStability: {
      monthPeriods: [
        {
          periodKey: "2025-12",
          observations: 126,
          signedCalibrationError: 0.25,
          edgeMatchesDirection: true,
        },
        {
          periodKey: "2026-01",
          observations: 134,
          signedCalibrationError: 0.13,
          edgeMatchesDirection: true,
        },
        {
          periodKey: "2026-02",
          observations: 50,
          signedCalibrationError: -0.005,
          edgeMatchesDirection: false,
        },
      ],
      quarterPeriods: [],
      monthPersistenceRate: 0.333333,
      quarterPersistenceRate: 0.666667,
      scoreComponent: 11,
    },
    regimeStability: {
      regimes: [
        { regime: "low", observations: 96, signedCalibrationError: 0.02, edgeMatchesDirection: false },
        { regime: "medium", observations: 12, signedCalibrationError: -0.01, edgeMatchesDirection: false },
        { regime: "high", observations: 6, signedCalibrationError: 0, edgeMatchesDirection: false },
      ],
      regimesWithEdge: 0,
      regimesWithData: 3,
      scoreComponent: 0,
    },
    sampleConcentration: {
      uniqueTradingDays: 91,
      largestContributingDay: "2026-05-01",
      largestDayObservations: 42,
      largestDayPercent: 7.6,
      singleDayDominated: false,
      scoreComponent: 23,
    },
    leaveOnePeriodOut: {
      folds: [],
      errorVariance: 0.0005,
      errorStdDev: 0.023,
      scoreComponent: 23,
    },
    ...overrides,
  };
}

describe("analyzeHypothesisFailure", () => {
  it("reports failure reasons and near-promising priority for strong failing hypothesis", () => {
    const analysis = analyzeHypothesisFailure({
      validation: createValidation(),
      candidate: {
        candidateId: "hyp-a",
        sourceArtifact: "mispricing-atlas.json",
        hypothesis: "Test hypothesis appears overconfident.",
        rationale: "rationale",
        marketCondition: "condition",
        suggestedStrategyFamily: "fade-overconfidence",
        requiredData: [],
        proposedEntryCondition: "entry",
        proposedExitSettlementAssumption: "exit",
        expectedFailureMode: "Edge disappears in high volatility.",
        killCriterion: "Negative calibration after expansion.",
        confidence: "medium",
        warnings: [],
      },
      coverageEntry: null,
      crossValidation: null,
      hypothesisHistory: null,
      passThreshold: 70,
    });

    expect(analysis.passes).toBe(false);
    expect(analysis.scoreGap).toBe(12);
    expect(analysis.priorityCategory).toBe("near-promising");
    expect(analysis.failureReasons.length).toBeGreaterThan(0);
    expect(analysis.failureReasons.some((reason) => reason.category === "below-pass-threshold")).toBe(
      true,
    );
    expect(analysis.failureReasons.some((reason) => reason.category === "poor-month-stability")).toBe(
      true,
    );
    expect(analysis.marginalEvidenceNeeds.length).toBeGreaterThan(0);
    expect(analysis.stabilityDiagnostics.strongestMonths[0]?.month).toBe("2025-12");
  });

  it("flags derived-data sensitivity when Dec 2025 dominates with edge", () => {
    const analysis = analyzeHypothesisFailure({
      validation: createValidation(),
      candidate: null,
      coverageEntry: null,
      crossValidation: null,
      hypothesisHistory: null,
      passThreshold: 70,
    });

    expect(
      analysis.failureReasons.some((reason) => reason.category === "derived-data-sensitivity"),
    ).toBe(true);
    expect(analysis.recommendedNextAction).toBe("inspect-derived-data-sensitivity");
  });
});

describe("computeHypothesisPriorityScore", () => {
  it("ranks higher robustness and more observations ahead", () => {
    const stronger = computeHypothesisPriorityScore({
      robustnessScore: 58,
      scoreGap: 12,
      observationCount: 553,
      uniqueTradingDays: 91,
      monthPersistenceRate: 0.33,
      quarterPersistenceRate: 0.66,
      largestDayPercent: 7.6,
      singleDayDominated: false,
      crossValidationPasses: null,
      hasStrategyFamily: true,
    });
    const weaker = computeHypothesisPriorityScore({
      robustnessScore: 34,
      scoreGap: 36,
      observationCount: 43,
      uniqueTradingDays: 5,
      monthPersistenceRate: 0.5,
      quarterPersistenceRate: 0.5,
      largestDayPercent: 69.7,
      singleDayDominated: true,
      crossValidationPasses: false,
      hasStrategyFamily: false,
    });

    expect(stronger).toBeGreaterThan(weaker);
  });
});

describe("classifyHypothesisPriorityCategory", () => {
  it("classifies blocked-by-coverage when trading days are insufficient", () => {
    expect(
      classifyHypothesisPriorityCategory({
        passes: false,
        robustnessScore: 40,
        scoreGap: 30,
        coverageClassification: null,
        singleDayDominated: false,
        monthPersistenceRate: 0.4,
        uniqueTradingDays: 3,
        monthCount: 4,
      }),
    ).toBe("blocked-by-coverage");
  });

  it("classifies likely-spurious for very low robustness", () => {
    expect(
      classifyHypothesisPriorityCategory({
        passes: false,
        robustnessScore: 20,
        scoreGap: 50,
        coverageClassification: null,
        singleDayDominated: true,
        monthPersistenceRate: 0.1,
        uniqueTradingDays: 20,
        monthCount: 4,
      }),
    ).toBe("likely-spurious");
  });
});

describe("resolveRecommendedNextAction", () => {
  it("recommends collect-more-data when blocked by coverage", () => {
    expect(
      resolveRecommendedNextAction({
        priorityCategory: "blocked-by-coverage",
        robustnessScore: 40,
        scoreGap: 30,
        failureReasons: [],
        hasDerivedSensitivity: false,
        historyWeakening: false,
      }),
    ).toBe("collect-more-data");
  });

  it("recommends strategy synthesis for near-promising high-score hypotheses", () => {
    expect(
      resolveRecommendedNextAction({
        priorityCategory: "near-promising",
        robustnessScore: 58,
        scoreGap: 12,
        failureReasons: [{ category: "below-pass-threshold", summary: "below", detail: null }],
        hasDerivedSensitivity: false,
        historyWeakening: false,
      }),
    ).toBe("strategy-synthesis-investigation");
  });
});

describe("rankHypothesisFailureAnalyses", () => {
  it("assigns priority ranks by descending priority score", () => {
    const ranked = rankHypothesisFailureAnalyses([
      {
        ...analyzeHypothesisFailure({
          validation: createValidation({ hypothesisId: "weak", robustnessScore: 30 }),
          candidate: null,
          coverageEntry: null,
          crossValidation: null,
          hypothesisHistory: null,
          passThreshold: 70,
        }),
        priorityRank: 0,
      },
      {
        ...analyzeHypothesisFailure({
          validation: createValidation({ hypothesisId: "strong", robustnessScore: 58 }),
          candidate: null,
          coverageEntry: null,
          crossValidation: null,
          hypothesisHistory: null,
          passThreshold: 70,
        }),
        priorityRank: 0,
      },
    ]);

    expect(ranked[0]?.hypothesisId).toBe("strong");
    expect(ranked[0]?.priorityRank).toBe(1);
    expect(ranked[1]?.priorityRank).toBe(2);
  });
});
