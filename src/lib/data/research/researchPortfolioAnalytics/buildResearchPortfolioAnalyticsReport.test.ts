import { describe, expect, it } from "vitest";

import { buildResearchPortfolioAnalyticsReport } from "./buildResearchPortfolioAnalyticsReport";
import { serializeResearchPortfolioAnalyticsHtml } from "./serializeResearchPortfolioAnalyticsHtml";
import { serializeResearchPortfolioAnalyticsReport } from "./serializeResearchPortfolioAnalyticsReport";
import type { LoadedResearchPortfolioAnalyticsInputs } from "./loadResearchPortfolioAnalyticsInputs";
import { DEFAULT_RESEARCH_PORTFOLIO_ANALYTICS_INPUT_PATHS } from "./researchPortfolioAnalyticsTypes";

const BASE_LOADED: LoadedResearchPortfolioAnalyticsInputs = {
  inputStatus: {
    hypothesisValidationPresent: true,
    hypothesisFailureAnalysisPresent: true,
    hypothesisCandidatesPresent: true,
    crossValidationPresent: false,
    coverageAwareValidationPresent: false,
    researchDimensionExplorerPresent: false,
  },
  candidates: [
    {
      candidateId: "atlas-moneyness-moneyness-near-below-over",
      sourceArtifact: "mispricing-atlas.json",
      hypothesis: "moneyness hypothesis",
      rationale: "rationale",
      marketCondition: "condition",
      suggestedStrategyFamily: "calibration-no-fade",
      requiredData: ["mispricing-atlas"],
      proposedEntryCondition: "entry",
      proposedExitSettlementAssumption: "exit",
      expectedFailureMode: "mode",
      killCriterion: "kill",
      confidence: "medium",
      warnings: [],
    },
    {
      candidateId: "atlas-probabilityMoneyness-coarse-prob-2-moneyness-near-below-over",
      sourceArtifact: "mispricing-atlas.json",
      hypothesis: "probability moneyness hypothesis",
      rationale: "rationale",
      marketCondition: "condition",
      suggestedStrategyFamily: "calibration-no-fade",
      requiredData: ["mispricing-atlas"],
      proposedEntryCondition: "entry",
      proposedExitSettlementAssumption: "exit",
      expectedFailureMode: "mode",
      killCriterion: "kill",
      confidence: "medium",
      warnings: [],
    },
  ],
  validations: [
    {
      hypothesisId: "atlas-moneyness-moneyness-near-below-over",
      hypothesis: "moneyness hypothesis",
      sourceArtifact: "mispricing-atlas.json",
      robustnessScore: 72,
      passes: true,
      reasons: [],
      observationCount: 200,
      timeStability: {
        monthPeriods: [],
        quarterPeriods: [],
        monthPersistenceRate: 0.8,
        quarterPersistenceRate: 0.75,
        scoreComponent: 20,
      },
      regimeStability: {
        regimes: [],
        regimesWithEdge: 2,
        regimesWithData: 3,
        scoreComponent: 15,
      },
      sampleConcentration: {
        uniqueTradingDays: 40,
        largestContributingDay: "2026-01-01",
        largestDayObservations: 10,
        largestDayPercent: 5,
        singleDayDominated: false,
        scoreComponent: 22,
      },
      leaveOnePeriodOut: {
        folds: [],
        errorVariance: 0.001,
        errorStdDev: 0.01,
        scoreComponent: 15,
      },
    },
    {
      hypothesisId: "atlas-probabilityMoneyness-coarse-prob-2-moneyness-near-below-over",
      hypothesis: "probability moneyness hypothesis",
      sourceArtifact: "mispricing-atlas.json",
      robustnessScore: 58,
      passes: false,
      reasons: ["Below threshold"],
      observationCount: 553,
      timeStability: {
        monthPeriods: [],
        quarterPeriods: [],
        monthPersistenceRate: 0.33,
        quarterPersistenceRate: 0.66,
        scoreComponent: 10,
      },
      regimeStability: {
        regimes: [],
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
        errorVariance: 0.001,
        errorStdDev: 0.023,
        scoreComponent: 23,
      },
    },
  ],
  failureAnalyses: [
    {
      hypothesisId: "atlas-probabilityMoneyness-coarse-prob-2-moneyness-near-below-over",
      hypothesis: "probability moneyness hypothesis",
      passes: false,
      robustnessScore: 58,
      passThreshold: 70,
      scoreGap: 12,
      observationCount: 553,
      uniqueTradingDays: 91,
      priorityRank: 1,
      priorityCategory: "near-promising",
      priorityScore: 125,
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
        monthPersistenceRate: 0.33,
        quarterPersistenceRate: 0.66,
        uniqueTradingDays: 91,
        monthCount: 6,
        leaveOnePeriodOutStdDev: 0.023,
        regimesWithData: 3,
        regimesWithEdge: 0,
      },
      marginalEvidenceNeeds: [],
      notes: [],
      suggestedStrategyFamily: "calibration-no-fade",
      coverageClassification: "promising-needs-more-history",
      crossValidationPasses: false,
    },
  ],
  passScoreThreshold: 70,
  failureAnalysisPassThreshold: 70,
  crossValidationEntryCount: 0,
  coverageEntryCount: 0,
  dimensionExplorerDimensionCount: null,
  dimensionExplorerAxisGroupCount: null,
};

describe("buildResearchPortfolioAnalyticsReport", () => {
  it("builds deterministic portfolio analytics report", () => {
    const report = buildResearchPortfolioAnalyticsReport({
      generatedAt: "2026-07-07T12:00:00.000Z",
      outputPath: "data/research-results/research-portfolio-analytics.json",
      htmlOutputPath: "data/reports/research-portfolio-analytics.html",
      inputPaths: DEFAULT_RESEARCH_PORTFOLIO_ANALYTICS_INPUT_PATHS,
      loadedInputs: BASE_LOADED,
    });

    expect(report.summary.totalCandidates).toBe(2);
    expect(report.summary.totalValidations).toBe(2);
    expect(report.summary.totalPasses).toBe(1);
    expect(report.summary.overallPassRate).toBe(0.5);

    const moneynessGroup = report.axisGroups.find((entry) => entry.groupId === "moneyness");
    expect(moneynessGroup?.candidateCount).toBe(1);
    expect(moneynessGroup?.passCount).toBe(1);
    expect(moneynessGroup?.passRate).toBe(1);

    const moneynessDimension = report.dimensions.find(
      (entry) => entry.dimensionId === "moneyness",
    );
    expect(moneynessDimension?.candidateCount).toBe(2);
    expect(moneynessDimension?.validationCount).toBe(2);

    expect(report.rankings.highestYieldingDimensions[0]?.id).toBe("moneyness");
    expect(report.rankings.strongestRobustnessDimensions[0]?.id).toBe("moneyness");

    const serialized = serializeResearchPortfolioAnalyticsReport(report);
    expect(serialized).toContain('"totalCandidates":2');
    expect(serializeResearchPortfolioAnalyticsHtml(report)).toContain(
      "Research Portfolio Analytics",
    );
  });

  it("produces identical serialized output for identical inputs", () => {
    const input = {
      generatedAt: "2026-07-07T12:00:00.000Z",
      outputPath: "data/research-results/research-portfolio-analytics.json",
      htmlOutputPath: "data/reports/research-portfolio-analytics.html",
      inputPaths: DEFAULT_RESEARCH_PORTFOLIO_ANALYTICS_INPUT_PATHS,
      loadedInputs: BASE_LOADED,
    };

    const left = serializeResearchPortfolioAnalyticsReport(
      buildResearchPortfolioAnalyticsReport(input),
    );
    const right = serializeResearchPortfolioAnalyticsReport(
      buildResearchPortfolioAnalyticsReport(input),
    );

    expect(left).toBe(right);
  });
});
