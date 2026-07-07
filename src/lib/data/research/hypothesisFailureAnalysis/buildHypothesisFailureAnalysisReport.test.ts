import { describe, expect, it } from "vitest";

import { buildHypothesisFailureAnalysisReport } from "./buildHypothesisFailureAnalysisReport";
import { serializeHypothesisFailureAnalysisHtml } from "./serializeHypothesisFailureAnalysisHtml";
import type { HypothesisValidationEntry } from "@/lib/data/research/hypothesisRobustness/hypothesisRobustnessTypes";

function createValidation(
  hypothesisId: string,
  robustnessScore: number,
): HypothesisValidationEntry {
  return {
    hypothesisId,
    hypothesis: `${hypothesisId} hypothesis`,
    sourceArtifact: "mispricing-atlas.json",
    robustnessScore,
    passes: robustnessScore >= 70,
    reasons: [`Robustness score ${robustnessScore} is below promotion threshold (70).`],
    observationCount: 100,
    timeStability: {
      monthPeriods: [
        {
          periodKey: "2026-01",
          observations: 50,
          signedCalibrationError: 0.1,
          edgeMatchesDirection: true,
        },
        {
          periodKey: "2026-02",
          observations: 50,
          signedCalibrationError: -0.05,
          edgeMatchesDirection: false,
        },
      ],
      quarterPeriods: [],
      monthPersistenceRate: 0.5,
      quarterPersistenceRate: 0.5,
      scoreComponent: 10,
    },
    regimeStability: {
      regimes: [
        { regime: "low", observations: 50, signedCalibrationError: 0.02, edgeMatchesDirection: false },
        { regime: "medium", observations: 50, signedCalibrationError: 0.01, edgeMatchesDirection: false },
        { regime: "high", observations: 0, signedCalibrationError: null, edgeMatchesDirection: false },
      ],
      regimesWithEdge: 0,
      regimesWithData: 2,
      scoreComponent: 0,
    },
    sampleConcentration: {
      uniqueTradingDays: 20,
      largestContributingDay: "2026-01-15",
      largestDayObservations: 15,
      largestDayPercent: 15,
      singleDayDominated: false,
      scoreComponent: 20,
    },
    leaveOnePeriodOut: {
      folds: [],
      errorVariance: 0.001,
      errorStdDev: 0.03,
      scoreComponent: 20,
    },
  };
}

describe("buildHypothesisFailureAnalysisReport", () => {
  it("builds a report for failing hypotheses", () => {
    const report = buildHypothesisFailureAnalysisReport({
      generatedAt: "2026-07-07T00:00:00.000Z",
      outputPath: "data/research-results/hypothesis-failure-analysis.json",
      htmlOutputPath: "data/reports/hypothesis-failure-analysis.html",
      inputPaths: {
        hypothesisCandidatesPath: "data/research-results/hypothesis-candidates.json",
        hypothesisValidationPath: "data/research-results/hypothesis-validation.json",
        mispricingAtlasPath: "data/research-results/mispricing-atlas.json",
        coverageAwareValidationPath: "data/research-results/coverage-aware-validation.json",
        crossValidationPath: "data/research-results/cross-validation.json",
        hypothesisHistoryPath: "data/research-results/hypothesis-history.json",
      },
      inputStatus: {
        hypothesisCandidatesPresent: true,
        hypothesisValidationPresent: true,
        mispricingAtlasPresent: true,
        coverageAwareValidationPresent: false,
        crossValidationPresent: false,
        hypothesisHistoryPresent: false,
      },
      candidates: [],
      validations: [
        createValidation("hyp-strong", 58),
        createValidation("hyp-weak", 30),
      ],
      mispricingAtlas: null,
      coverageEntries: [],
      crossValidationEntries: [],
      hypothesisHistory: null,
    });

    expect(report.summary.totalHypotheses).toBe(2);
    expect(report.summary.failingCount).toBe(2);
    expect(report.summary.passingCount).toBe(0);
    expect(report.analyses[0]?.priorityRank).toBe(1);
    expect(report.analyses[0]?.hypothesisId).toBe("hyp-strong");
  });

  it("returns an empty report when no hypotheses are present", () => {
    const report = buildHypothesisFailureAnalysisReport({
      generatedAt: "2026-07-07T00:00:00.000Z",
      outputPath: "data/research-results/hypothesis-failure-analysis.json",
      htmlOutputPath: "data/reports/hypothesis-failure-analysis.html",
      inputPaths: {
        hypothesisCandidatesPath: "data/research-results/hypothesis-candidates.json",
        hypothesisValidationPath: "data/research-results/hypothesis-validation.json",
        mispricingAtlasPath: "data/research-results/mispricing-atlas.json",
        coverageAwareValidationPath: "data/research-results/coverage-aware-validation.json",
        crossValidationPath: "data/research-results/cross-validation.json",
        hypothesisHistoryPath: "data/research-results/hypothesis-history.json",
      },
      inputStatus: {
        hypothesisCandidatesPresent: false,
        hypothesisValidationPresent: false,
        mispricingAtlasPresent: false,
        coverageAwareValidationPresent: false,
        crossValidationPresent: false,
        hypothesisHistoryPresent: false,
      },
      candidates: [],
      validations: [],
      mispricingAtlas: null,
      coverageEntries: [],
      crossValidationEntries: [],
      hypothesisHistory: null,
    });

    expect(report.summary.totalHypotheses).toBe(0);
    expect(report.analyses).toEqual([]);
  });
});

describe("serializeHypothesisFailureAnalysisHtml", () => {
  it("includes hypothesis ids and failure reason badges", () => {
    const report = buildHypothesisFailureAnalysisReport({
      generatedAt: "2026-07-07T00:00:00.000Z",
      outputPath: "data/research-results/hypothesis-failure-analysis.json",
      htmlOutputPath: "data/reports/hypothesis-failure-analysis.html",
      inputPaths: {
        hypothesisCandidatesPath: "a",
        hypothesisValidationPath: "b",
        mispricingAtlasPath: "c",
        coverageAwareValidationPath: "d",
        crossValidationPath: "e",
        hypothesisHistoryPath: "f",
      },
      inputStatus: {
        hypothesisCandidatesPresent: true,
        hypothesisValidationPresent: true,
        mispricingAtlasPresent: true,
        coverageAwareValidationPresent: false,
        crossValidationPresent: false,
        hypothesisHistoryPresent: false,
      },
      candidates: [],
      validations: [createValidation("hyp-strong", 58)],
      mispricingAtlas: null,
      coverageEntries: [],
      crossValidationEntries: [],
      hypothesisHistory: null,
    });

    const html = serializeHypothesisFailureAnalysisHtml(report);

    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("Hypothesis Failure Analysis");
    expect(html).toContain("hyp-strong");
    expect(html).toContain("below pass threshold");
  });
});
