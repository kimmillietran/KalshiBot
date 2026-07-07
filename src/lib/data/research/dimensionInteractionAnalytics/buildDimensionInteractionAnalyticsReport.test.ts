import { describe, expect, it } from "vitest";

import {
  buildDimensionInteractionAnalyticsReport,
  serializeDimensionInteractionAnalyticsReport,
} from "./buildDimensionInteractionAnalyticsReport";
import { serializeDimensionInteractionAnalyticsHtml } from "./serializeDimensionInteractionAnalyticsHtml";

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
    passingCount: 1,
    failingCount: 0,
    averageRobustnessScore: 75,
  },
  validations: [
    {
      hypothesisId: "atlas-probabilityMomentum-prob-70-80-mom-up-over",
      hypothesis: "Probability × momentum overpricing",
      sourceArtifact: "mispricing-atlas.json",
      robustnessScore: 75,
      passes: true,
      reasons: [],
      observationCount: 20,
      timeStability: {
        monthPeriods: [],
        quarterPeriods: [],
        monthPersistenceRate: 0.8,
        quarterPersistenceRate: 0.8,
      },
      regimeStability: {
        regimes: [],
        regimesWithEdge: 1,
        regimesWithData: 1,
      },
      sampleConcentration: {
        uniqueTradingDays: 10,
        largestContributingDay: null,
        largestDayObservations: 0,
        largestDayPercent: 0,
        singleDayDominated: false,
      },
      leaveOnePeriodOut: {
        folds: [],
        errorVariance: 0,
        errorStdDev: 0,
      },
    },
  ],
});

const CANDIDATES_JSON = JSON.stringify({
  generatedAt: "2026-01-01T00:00:00.000Z",
  outputPath: "data/research-results/hypothesis-candidates.json",
  config: {
    minSampleSize: 10,
    minCalibrationError: 0.05,
    minLeadLagCorrelation: 0.1,
    minUniqueTradingDays: 3,
    minSampleSizeByGroup: {},
  },
  inputs: {
    mispricingAtlasPath: "data/research-results/mispricing-atlas.json",
    leadLagAnalysisPath: "data/research-results/lead-lag-analysis.json",
    statisticalSignificancePath: "data/research-results/statistical-significance.json",
    regimeTagsPath: "data/research-results/regime-tags.json",
    strategyLeaderboardPath: "data/research-results/strategy-leaderboard.json",
    mispricingAtlasPresent: true,
    leadLagAnalysisPresent: false,
    statisticalSignificancePresent: false,
    regimeTagsPresent: false,
    strategyLeaderboardPresent: false,
  },
  candidates: [
    {
      candidateId: "atlas-probabilityMomentum-prob-70-80-mom-up-over",
      sourceArtifact: "mispricing-atlas.json",
      hypothesis: "Probability × momentum overpricing",
      rationale: "test",
      marketCondition: "test",
      suggestedStrategyFamily: "test",
      requiredData: [],
      proposedEntryCondition: "test",
      proposedExitSettlementAssumption: "test",
      expectedFailureMode: "test",
      killCriterion: "test",
      confidence: "medium",
      warnings: [],
      bucketMetadata: {
        groupId: "probabilityMomentum",
        bucketId: "prob-70-80-mom-up",
        bucketLabel: "70-80% up momentum",
        observations: 20,
        uniqueTradingDays: 8,
        calibrationError: 0.09,
        calibrationDirection: "over",
      },
    },
  ],
  summary: {
    candidateCount: 1,
    noCandidateReasons: [],
    atlasCoverageDiagnostics: null,
  },
});

describe("buildDimensionInteractionAnalyticsReport", () => {
  it("records empty input reasons when required artifacts are missing", () => {
    const report = buildDimensionInteractionAnalyticsReport({
      generatedAt: "2026-01-01T00:00:00.000Z",
      outputPath: "data/research-results/research-interaction-analysis.json",
      htmlOutputPath: "data/reports/research-interaction-analysis.html",
      inputPaths: {
        hypothesisCandidatesPath: "data/research-results/hypothesis-candidates.json",
        hypothesisValidationPath: "data/research-results/hypothesis-validation.json",
        mispricingAtlasPath: "data/research-results/mispricing-atlas.json",
        hypothesisFailureAnalysisPath: "data/research-results/hypothesis-failure-analysis.json",
      },
      io: {
        readFile: () => "",
        fileExists: () => false,
      },
    });

    expect(report.summary.emptyInputReasons).toContain("Missing hypothesis-candidates.json");
    expect(report.summary.emptyInputReasons).toContain("Missing hypothesis-validation.json");
    expect(report.interactions.length).toBeGreaterThan(0);
    expect(report.rankings.bestInteractions.length).toBe(report.interactions.length);
  });

  it("builds interaction metrics and serializes JSON/HTML", () => {
    const report = buildDimensionInteractionAnalyticsReport({
      generatedAt: "2026-01-01T00:00:00.000Z",
      outputPath: "data/research-results/research-interaction-analysis.json",
      htmlOutputPath: "data/reports/research-interaction-analysis.html",
      inputPaths: {
        hypothesisCandidatesPath: "data/research-results/hypothesis-candidates.json",
        hypothesisValidationPath: "data/research-results/hypothesis-validation.json",
        mispricingAtlasPath: "data/research-results/mispricing-atlas.json",
        hypothesisFailureAnalysisPath: "data/research-results/hypothesis-failure-analysis.json",
      },
      io: {
        readFile: (path) => {
          if (path.endsWith("hypothesis-validation.json")) {
            return VALIDATION_JSON;
          }

          if (path.endsWith("hypothesis-candidates.json")) {
            return CANDIDATES_JSON;
          }

          return "";
        },
        fileExists: (path) =>
          path.endsWith("hypothesis-validation.json")
          || path.endsWith("hypothesis-candidates.json"),
      },
    });

    const probabilityMomentum = report.interactions.find(
      (entry) => entry.groupId === "probabilityMomentum",
    );

    expect(probabilityMomentum?.candidateCount).toBe(1);
    expect(probabilityMomentum?.passRate).toBe(1);
    expect(report.investigatorNotes.some((note) => note.includes("not SHAP"))).toBe(true);
    expect(serializeDimensionInteractionAnalyticsReport(report)).toContain("probabilityMomentum");
    expect(serializeDimensionInteractionAnalyticsHtml(report)).toContain("Best interactions");
  });
});
