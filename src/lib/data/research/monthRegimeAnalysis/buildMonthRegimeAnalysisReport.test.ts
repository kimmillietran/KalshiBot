import { describe, expect, it } from "vitest";

import {
  buildMonthRegimeAnalysisReport,
  serializeMonthRegimeAnalysisReport,
} from "./buildMonthRegimeAnalysisReport";
import { serializeMonthRegimeAnalysisHtml } from "./serializeMonthRegimeAnalysisHtml";

const VALIDATION_JSON = JSON.stringify({
  generatedAt: "2026-01-01T00:00:00.000Z",
  outputPath: "data/research-results/hypothesis-validation.json",
  htmlOutputPath: "data/reports/research-hypothesis-validation.html",
  inputPaths: {
    hypothesisCandidatesPath: "data/research-results/hypothesis-candidates.json",
    mispricingAtlasPath: "data/research-results/mispricing-atlas.json",
    researchResultsDir: "data/research-results",
    regimeTagsPath: "data/research-results/regime-tags.json",
  },
  config: {
    passScoreThreshold: 70,
    minCalibrationError: 0.05,
    singleDayConcentrationFlag: 0.5,
    minPeriodObservations: 3,
  },
  summary: {
    totalHypotheses: 1,
    passingCount: 0,
    failingCount: 1,
    averageRobustnessScore: 58,
  },
  validations: [
    {
      hypothesisId: "atlas-probability-prob-70-80-over",
      hypothesis: "70-80% bucket overpricing",
      sourceArtifact: "mispricing-atlas.json",
      robustnessScore: 58,
      passes: false,
      reasons: ["month-regime-instability"],
      observationCount: 20,
      timeStability: {
        monthPeriods: [
          {
            periodKey: "2025-12",
            observations: 8,
            signedCalibrationError: 0.12,
            edgeMatchesDirection: true,
          },
          {
            periodKey: "2026-03",
            observations: 8,
            signedCalibrationError: -0.1,
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
    },
  ],
});

describe("buildMonthRegimeAnalysisReport", () => {
  it("returns an empty report when validation input is missing", () => {
    const report = buildMonthRegimeAnalysisReport({
      generatedAt: "2026-01-01T00:00:00.000Z",
      outputPath: "data/research-results/month-regime-analysis.json",
      htmlOutputPath: "data/reports/month-regime-analysis.html",
      inputPaths: {
        hypothesisCandidatesPath: "data/research-results/hypothesis-candidates.json",
        hypothesisValidationPath: "data/research-results/hypothesis-validation.json",
        regimeTagsPath: "data/research-results/regime-tags.json",
        researchResultsDir: "data/research-results",
      },
      io: {
        readFile: () => "",
        fileExists: () => false,
        readdir: () => [],
        isDirectory: () => false,
      },
    });

    expect(report.analyses).toEqual([]);
    expect(report.summary.emptyInputReasons).toContain("Missing hypothesis-validation.json");
  });

  it("builds analyses from validation artifacts without research scan", () => {
    const report = buildMonthRegimeAnalysisReport({
      generatedAt: "2026-01-01T00:00:00.000Z",
      outputPath: "data/research-results/month-regime-analysis.json",
      htmlOutputPath: "data/reports/month-regime-analysis.html",
      inputPaths: {
        hypothesisCandidatesPath: "data/research-results/hypothesis-candidates.json",
        hypothesisValidationPath: "data/research-results/hypothesis-validation.json",
        regimeTagsPath: "data/research-results/regime-tags.json",
        researchResultsDir: "data/research-results",
      },
      io: {
        readFile: (path) => {
          if (path.endsWith("hypothesis-validation.json")) {
            return VALIDATION_JSON;
          }

          return "";
        },
        fileExists: (path) => path.endsWith("hypothesis-validation.json"),
        readdir: () => [],
        isDirectory: () => false,
      },
    });

    expect(report.analyses).toHaveLength(1);
    expect(report.analyses[0]?.summary.reversingMonths).toEqual(["2026-03"]);
    expect(report.analyses[0]?.monthExplanation).toContain("reverses in Mar 2026");
    expect(serializeMonthRegimeAnalysisReport(report)).toContain("2026-03");
    expect(serializeMonthRegimeAnalysisHtml(report)).toContain("Month × regime heatmap");
  });
});
