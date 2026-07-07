import { describe, expect, it } from "vitest";

import type { HypothesisFailureAnalysisEntry } from "@/lib/data/research/hypothesisFailureAnalysis/hypothesisFailureAnalysisTypes";

import { buildHypothesisRefinementReport } from "./buildHypothesisRefinementReport";
import { generateHypothesisRefinements } from "./generateHypothesisRefinements";
import { parseParentHypothesisId } from "./parseParentHypothesisId";
import { serializeHypothesisRefinementsHtml } from "./serializeHypothesisRefinementsHtml";

function createNearPromisingAnalysis(
  overrides?: Partial<HypothesisFailureAnalysisEntry>,
): HypothesisFailureAnalysisEntry {
  return {
    hypothesisId: "atlas-volatilityProbabilityTime-vol-high-coarse-prob-1-coarse-time-early-over",
    hypothesis:
      "High (>=60% annualized) × [0.3, 0.7) × < 15 minutes remaining appears overconfident; test NO fade against implied probability.",
    passes: false,
    robustnessScore: 59,
    passThreshold: 70,
    scoreGap: 11,
    observationCount: 457,
    uniqueTradingDays: 63,
    priorityRank: 1,
    priorityCategory: "near-promising",
    priorityScore: 125.52,
    recommendedNextAction: "inspect-month-breakdown",
    failureReasons: [
      {
        category: "poor-month-stability",
        summary: "Month-level edge persistence is weak (60%).",
        detail: null,
      },
      {
        category: "weak-calibration-gap",
        summary: "Calibration edge is unstable or reverses across time buckets.",
        detail: null,
      },
      {
        category: "regime-instability",
        summary: "Regime tags unavailable or no regime buckets have data.",
        detail: null,
      },
    ],
    stabilityDiagnostics: {
      strongestMonths: [
        {
          month: "2026-02",
          observations: 201,
          edgeMatchesDirection: true,
          signedCalibrationError: 0.095,
          observationShare: 0.44,
        },
        {
          month: "2026-01",
          observations: 46,
          edgeMatchesDirection: true,
          signedCalibrationError: 0.114,
          observationShare: 0.1,
        },
      ],
      weakestMonths: [
        {
          month: "2026-03",
          observations: 146,
          edgeMatchesDirection: false,
          signedCalibrationError: -0.047,
          observationShare: 0.32,
        },
        {
          month: "2026-04",
          observations: 23,
          edgeMatchesDirection: false,
          signedCalibrationError: 0.047,
          observationShare: 0.05,
        },
      ],
      missingOrThinMonths: ["2026-05"],
      highConcentrationDays: [],
      signalBreadth: "mixed",
      monthPersistenceRate: 0.6,
      quarterPersistenceRate: 0.33,
      uniqueTradingDays: 63,
      monthCount: 6,
      leaveOnePeriodOutStdDev: 0.024,
      regimesWithData: 0,
      regimesWithEdge: 0,
    },
    marginalEvidenceNeeds: [],
    notes: [],
    suggestedStrategyFamily: "calibration-no-fade",
    coverageClassification: "inconclusive-regime-sparse",
    crossValidationPasses: false,
    ...overrides,
  };
}

const DEFAULT_INPUT_PATHS = {
  hypothesisFailureAnalysisPath: "data/research-results/hypothesis-failure-analysis.json",
  hypothesisValidationPath: "data/research-results/hypothesis-validation.json",
  mispricingAtlasPath: "data/research-results/mispricing-atlas.json",
  crossValidationPath: "data/research-results/cross-validation.json",
};

describe("parseParentHypothesisId", () => {
  it("parses multi-axis atlas hypothesis ids", () => {
    expect(
      parseParentHypothesisId(
        "atlas-volatilityProbabilityTime-vol-high-coarse-prob-1-coarse-time-early-over",
      ),
    ).toEqual({
      groupId: "volatilityProbabilityTime",
      bucketId: "vol-high-coarse-prob-1-coarse-time-early",
      direction: "over",
    });
  });
});

describe("generateHypothesisRefinements", () => {
  it("generates refinements for near-promising hypotheses", () => {
    const refinements = generateHypothesisRefinements({
      failureAnalyses: [createNearPromisingAnalysis()],
      validations: [],
      mispricingAtlas: {
        generatedAt: "2026-07-07T00:00:00.000Z",
        inputRoot: "data/research-results",
        outputPath: "data/research-results/mispricing-atlas.json",
        sampleCounts: {
          totalObservations: 1000,
          marketCount: 10,
          skippedMissingSettlement: 0,
          skippedMissingProbability: 0,
          skippedMissingContext: 0,
        },
        overallCalibration: {
          bucketId: "overall",
          bucketLabel: "overall",
          observations: 1000,
          averageImpliedProbability: 0.5,
          realizedFrequency: 0.5,
          calibrationError: 0.05,
          brierScore: 0.2,
          averageAbsoluteError: 0.1,
        },
        probabilityBuckets: [],
        timeRemainingBuckets: [
          {
            bucketId: "time-0-5m",
            bucketLabel: "0-5 minutes remaining",
            observations: 120,
            averageImpliedProbability: 0.5,
            realizedFrequency: 0.55,
            calibrationError: 0.05,
            brierScore: 0.2,
            averageAbsoluteError: 0.1,
          },
        ],
        moneynessBuckets: [],
        volatilityBuckets: [
          {
            bucketId: "vol-medium",
            bucketLabel: "Medium (30-60% annualized)",
            observations: 80,
            averageImpliedProbability: 0.5,
            realizedFrequency: 0.52,
            calibrationError: 0.04,
            brierScore: 0.2,
            averageAbsoluteError: 0.1,
          },
        ],
        warnings: [],
      },
      crossValidationEntries: [],
    });

    expect(refinements.length).toBeGreaterThan(0);
    expect(refinements.every((entry) => entry.status === "candidate-refinement")).toBe(true);
    expect(
      refinements.some((entry) => entry.refinementType === "probability-bucket-split"),
    ).toBe(true);
    expect(refinements.some((entry) => entry.refinementType === "time-bucket-split")).toBe(true);
    expect(
      refinements.some((entry) => entry.refinementType === "exclude-reversing-months"),
    ).toBe(true);
  });

  it("skips hopeless and coverage-blocked hypotheses", () => {
    const refinements = generateHypothesisRefinements({
      failureAnalyses: [
        createNearPromisingAnalysis(),
        createNearPromisingAnalysis({
          hypothesisId: "atlas-moneyness-moneyness-above-2pct-over",
          hypothesis: ">= 2% from strike appears overconfident.",
          priorityCategory: "blocked-by-coverage",
          priorityScore: -8,
          failureReasons: [
            {
              category: "insufficient-trading-days",
              summary: "Only 5 unique trading days (need 8).",
              detail: null,
            },
          ],
        }),
        createNearPromisingAnalysis({
          hypothesisId: "atlas-probabilityMoneyness-coarse-prob-0-moneyness-near-above-under",
          hypothesis: "[0.0, 0.3) appears underconfident.",
          priorityCategory: "likely-spurious",
          priorityScore: 80,
        }),
      ],
      validations: [],
      mispricingAtlas: null,
      crossValidationEntries: [],
    });

    const parentIds = new Set(refinements.map((entry) => entry.parentHypothesisId));
    expect(parentIds.has("atlas-volatilityProbabilityTime-vol-high-coarse-prob-1-coarse-time-early-over")).toBe(
      true,
    );
    expect(parentIds.has("atlas-moneyness-moneyness-above-2pct-over")).toBe(false);
    expect(parentIds.has("atlas-probabilityMoneyness-coarse-prob-0-moneyness-near-above-under")).toBe(
      false,
    );
  });

  it("handles missing optional inputs", () => {
    const refinements = generateHypothesisRefinements({
      failureAnalyses: [createNearPromisingAnalysis()],
      validations: [],
      mispricingAtlas: null,
      crossValidationEntries: [],
    });

    expect(refinements.length).toBeGreaterThan(0);
    expect(
      refinements.some((entry) => entry.refinementType === "exclude-reversing-months"),
    ).toBe(true);
  });

  it("ranks refinements deterministically", () => {
    const input = {
      failureAnalyses: [createNearPromisingAnalysis()],
      validations: [],
      mispricingAtlas: null,
      crossValidationEntries: [],
    };

    const first = generateHypothesisRefinements(input);
    const second = generateHypothesisRefinements(input);

    expect(first.map((entry) => entry.refinementId)).toEqual(
      second.map((entry) => entry.refinementId),
    );
    expect(first.map((entry) => entry.priorityRank)).toEqual(
      second.map((entry) => entry.priorityRank),
    );
  });
});

describe("buildHypothesisRefinementReport", () => {
  it("serializes HTML with parent and child relationships", () => {
    const report = buildHypothesisRefinementReport({
      generatedAt: "2026-07-07T00:00:00.000Z",
      outputPath: "data/research-results/hypothesis-refinements.json",
      htmlOutputPath: "data/reports/hypothesis-refinements.html",
      inputPaths: DEFAULT_INPUT_PATHS,
      inputStatus: {
        hypothesisFailureAnalysisPresent: true,
        hypothesisValidationPresent: true,
        mispricingAtlasPresent: false,
        crossValidationPresent: false,
      },
      failureAnalyses: [createNearPromisingAnalysis()],
      validations: [],
      mispricingAtlas: null,
      crossValidationEntries: [],
    });

    const html = serializeHypothesisRefinementsHtml(report);

    expect(html).toContain("Hypothesis Refinement Generator");
    expect(html).toContain("candidate-refinement");
    expect(html).toContain('id="parent-atlas-volatilityProbabilityTime-vol-high-coarse-prob-1-coarse-time-early-over"');
    expect(html).toContain("Child refinements");
    expect(html).toContain("Parent:");
    expect(report.disclaimer).toContain("not validated");
  });

  it("generates derived-settlement refinements when sensitivity is flagged", () => {
    const report = buildHypothesisRefinementReport({
      generatedAt: "2026-07-07T00:00:00.000Z",
      outputPath: "data/research-results/hypothesis-refinements.json",
      htmlOutputPath: "data/reports/hypothesis-refinements.html",
      inputPaths: DEFAULT_INPUT_PATHS,
      inputStatus: {
        hypothesisFailureAnalysisPresent: true,
        hypothesisValidationPresent: false,
        mispricingAtlasPresent: false,
        crossValidationPresent: false,
      },
      failureAnalyses: [
        createNearPromisingAnalysis({
          hypothesisId: "atlas-probabilityMoneyness-coarse-prob-2-moneyness-near-below-over",
          hypothesis: "[0.7, 1.0] × -2% to 0% from strike appears overconfident.",
          failureReasons: [
            {
              category: "derived-data-sensitivity",
              summary: "Dec 2025 derived-settlement data may influence the signal.",
              detail: null,
            },
            {
              category: "poor-month-stability",
              summary: "Month-level edge persistence is weak (33%).",
              detail: null,
            },
          ],
        }),
      ],
      validations: [],
      mispricingAtlas: null,
      crossValidationEntries: [],
    });

    expect(
      report.refinements.some((entry) => entry.refinementType === "official-settlement-only"),
    ).toBe(true);
    expect(
      report.refinements.some((entry) => entry.refinementType === "derived-settlement-aware"),
    ).toBe(true);
  });
});
