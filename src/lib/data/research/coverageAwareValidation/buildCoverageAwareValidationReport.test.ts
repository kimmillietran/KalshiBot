import { describe, expect, it } from "vitest";

import { buildCoverageAwareValidationReport } from "./buildCoverageAwareValidationReport";
import { serializeCoverageAwareValidationHtml } from "./serializeCoverageAwareValidationHtml";
import type { HypothesisValidationEntry } from "@/lib/data/research/hypothesisRobustness/hypothesisRobustnessTypes";

const GENERATED_AT = "2026-07-04T12:00:00.000Z";

function createValidation(
  hypothesisId: string,
  overrides: Partial<HypothesisValidationEntry> = {},
): HypothesisValidationEntry {
  return {
    hypothesisId,
    hypothesis: "Test hypothesis",
    sourceArtifact: "mispricing-atlas.json",
    robustnessScore: 40,
    passes: false,
    reasons: ["Weak month persistence"],
    observationCount: 4,
    timeStability: {
      monthPeriods: [{ periodKey: "2023-10", observations: 4, signedCalibrationError: 0.1, edgeMatchesDirection: true }],
      quarterPeriods: [],
      monthPersistenceRate: 0.5,
      quarterPersistenceRate: 0.5,
      scoreComponent: 10,
    },
    regimeStability: {
      regimes: [
        { regime: "low", observations: 1, signedCalibrationError: 0.05, edgeMatchesDirection: true },
        { regime: "medium", observations: 2, signedCalibrationError: 0.1, edgeMatchesDirection: true },
        { regime: "high", observations: 1, signedCalibrationError: 0.08, edgeMatchesDirection: true },
      ],
      regimesWithEdge: 2,
      regimesWithData: 3,
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

describe("buildCoverageAwareValidationReport", () => {
  it("builds advisory entries without modifying validation scores", () => {
    const report = buildCoverageAwareValidationReport({
      generatedAt: GENERATED_AT,
      outputPath: "data/research-results/coverage-aware-validation.json",
      htmlOutputPath: "data/reports/coverage-aware-validation.html",
      inputPaths: {
        hypothesisValidationPath: "data/research-results/hypothesis-validation.json",
        crossValidationPath: "data/research-results/cross-validation.json",
        historicalCoveragePlanPath: "data/research-results/historical-coverage-plan.json",
        hypothesisCandidatesPath: "data/research-results/hypothesis-candidates.json",
      },
      candidates: [],
      validations: [createValidation("atlas-volatility-vol-high-over")],
      crossValidationEntries: [],
      coveragePlan: null,
    });

    expect(report.summary.totalHypotheses).toBe(1);
    expect(report.entries[0]?.classification).toBe("inconclusive-insufficient-coverage");
    expect(report.entries[0]?.metrics.robustnessScore).toBe(40);
    expect(report.entries[0]?.missingCoverageExplanation).toContain("observations");

    const html = serializeCoverageAwareValidationHtml(report);
    expect(html).toContain("Coverage-Aware Validation");
    expect(html).toContain("atlas-volatility-vol-high-over");
  });

  it("degrades gracefully with no upstream artifacts", () => {
    const report = buildCoverageAwareValidationReport({
      generatedAt: GENERATED_AT,
      outputPath: "data/research-results/coverage-aware-validation.json",
      htmlOutputPath: "data/reports/coverage-aware-validation.html",
      inputPaths: {
        hypothesisValidationPath: "data/research-results/hypothesis-validation.json",
        crossValidationPath: "data/research-results/cross-validation.json",
        historicalCoveragePlanPath: "data/research-results/historical-coverage-plan.json",
        hypothesisCandidatesPath: "data/research-results/hypothesis-candidates.json",
      },
      candidates: [],
      validations: [],
      crossValidationEntries: [],
      coveragePlan: null,
    });

    expect(report.summary.totalHypotheses).toBe(0);
    expect(report.entries).toEqual([]);
  });
});
