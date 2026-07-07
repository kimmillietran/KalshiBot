import { describe, expect, it } from "vitest";

import { serializePipelineDashboardHtml } from "./serializePipelineDashboardHtml";
import {
  DEFAULT_PIPELINE_DASHBOARD_INPUT_PATHS,
  DEFAULT_RESEARCH_DASHBOARD_HTML_PATH,
  type PipelineDashboardReport,
} from "./pipelineDashboardTypes";

const REPORT: PipelineDashboardReport = {
  generatedAt: "2026-07-03T21:00:00.000Z",
  outputPath: DEFAULT_RESEARCH_DASHBOARD_HTML_PATH,
  inputPaths: DEFAULT_PIPELINE_DASHBOARD_INPUT_PATHS,
  pipelineStatus: {
    pipelineStatus: "partial",
    completedSteps: ["Discover markets"],
    failedSteps: ["Generate hypotheses"],
    generatedAt: "2026-07-03T20:00:00.000Z",
    durationMs: 120000,
    totalSteps: 2,
  },
  artifactHealth: {
    present: 1,
    stale: 0,
    missing: 1,
    artifactIndexPath: DEFAULT_PIPELINE_DASHBOARD_INPUT_PATHS.artifactIndexPath,
    artifactIndexPresent: false,
    entries: [],
  },
  hypothesisSummary: {
    hypothesisCount: 0,
    validatedCount: 0,
    promotedCount: 0,
    rejectedCount: 0,
  },
  strategySummary: {
    synthesizedStrategies: 0,
    executedStrategies: 0,
    topCandidateStrategyId: null,
    topCandidateRank: null,
    topCandidateTotalPnlCents: null,
  },
  researchHealth: {
    calibrationCoveragePct: null,
    atlasObservations: null,
    warningCount: 0,
    dataHealthGeneratedAt: null,
    dataHealthSummary: null,
    dataHealthPath: DEFAULT_PIPELINE_DASHBOARD_INPUT_PATHS.dataHealthPath,
    dataHealthPresent: false,
  },
  coveragePhase: {
    runMode: "unknown",
    plan: {
      label: "Coverage plan",
      path: "data/research-results/historical-coverage-plan.json",
      present: false,
      generatedAt: null,
      orchestratorStepStatus: null,
    },
    expansionConfig: {
      label: "Expansion import config",
      path: "data/import-configs/historical-expansion-config.json",
      present: false,
      generatedAt: null,
      orchestratorStepStatus: null,
    },
    expansionImportExecution: {
      label: "Expansion import execution",
      path: "data/research-results/historical-expansion-import-summary.json",
      present: false,
      generatedAt: null,
      orchestratorStepStatus: null,
    },
    rebuildAfterExpansion: {
      label: "Rebuild after expansion",
      path: "data/research-results/expansion-rebuild-summary.json",
      present: false,
      generatedAt: null,
      orchestratorStepStatus: null,
    },
    coverageValidation: {
      label: "Coverage-aware validation",
      path: "data/research-results/coverage-aware-validation.json",
      present: false,
      generatedAt: null,
      orchestratorStepStatus: null,
    },
    currentMarketCount: null,
    uniqueTradingDays: null,
    missingMonthCount: null,
    recommendedImportWindowCount: null,
    expansionJobCount: null,
    summary: null,
  },
  historicalImportability: {
    summaryPath: "data/research-results/historical-expansion-import-summary.json",
    summaryPresent: false,
    supportedWindows: 0,
    unsupportedWindows: 0,
    historicalSuccessRate: null,
    totalAttempts: 0,
    successfulImports: 0,
    unsupportedMarkets: 0,
  },
  hypothesisEvolution: {
    historyPath: "data/research-results/hypothesis-history.json",
    historyPresent: false,
    runCount: 0,
    strongestImprovingHypothesis: null,
    largestRobustnessGain: null,
    largestObservationGrowth: null,
    approachingPromotion: [],
    regressedHypotheses: [],
    strengtheningCount: 0,
    weakeningCount: 0,
  },
  expansionRunHistory: {
    historyPath: "data/research-results/expansion-run-history.json",
    historyPresent: true,
    runCount: 2,
    latestRunGeneratedAt: "2026-07-05T12:00:00.000Z",
    latestImportedCount: 984,
    latestImportsPerMinute: 118,
    bestThroughputImportsPerMinute: 118,
    bestThroughputGeneratedAt: "2026-07-05T12:00:00.000Z",
    worstBottleneckDiscoveryShare: 0.83,
    worstBottleneckGeneratedAt: "2026-07-01T10:00:00.000Z",
    efficiencyImproving: true,
  },
  researchDiagnostics: {
    availableCount: 1,
    totalCount: 4,
    nearPromisingHypothesisCount: 2,
    highestRobustnessScore: 59,
    derivedSensitiveHypothesisCount: null,
    refinementCandidateCount: null,
    strategySynthesisFunnelStatus: null,
    harnessCandidateCount: null,
    cards: [
      {
        artifactId: "hypothesis-failure-analysis",
        label: "Hypothesis failure analysis",
        jsonPath: "data/research-results/hypothesis-failure-analysis.json",
        htmlPath: "data/reports/hypothesis-failure-analysis.html",
        present: true,
        generatedAt: "2026-07-07T03:29:15.026Z",
        metrics: [
          { label: "Near-promising", value: "2" },
          { label: "Highest robustness", value: "59" },
          { label: "Total hypotheses", value: "5" },
        ],
      },
      {
        artifactId: "derived-settlement-sensitivity",
        label: "Derived settlement sensitivity",
        jsonPath: "data/research-results/derived-settlement-sensitivity.json",
        htmlPath: "data/reports/derived-settlement-sensitivity.html",
        present: false,
        generatedAt: null,
        metrics: [],
      },
      {
        artifactId: "hypothesis-refinements",
        label: "Hypothesis refinements",
        jsonPath: "data/research-results/hypothesis-refinements.json",
        htmlPath: "data/reports/hypothesis-refinements.html",
        present: false,
        generatedAt: null,
        metrics: [],
      },
      {
        artifactId: "strategy-synthesis-debug",
        label: "Strategy synthesis debug",
        jsonPath: "data/research-results/strategy-synthesis-debug.json",
        htmlPath: "data/reports/strategy-synthesis-debug.html",
        present: false,
        generatedAt: null,
        metrics: [],
      },
    ],
  },
};

describe("serializePipelineDashboardHtml", () => {
  it("escapes unsafe HTML in dashboard content", () => {
    const html = serializePipelineDashboardHtml({
      ...REPORT,
      strategySummary: {
        ...REPORT.strategySummary,
        topCandidateStrategyId: "<script>alert(1)</script>",
      },
    });

    expect(html.startsWith("<!DOCTYPE html>")).toBe(true);
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).not.toContain("<script>alert(1)</script>");
  });

  it("renders the historical importability section", () => {
    const html = serializePipelineDashboardHtml({
      ...REPORT,
      historicalImportability: {
        ...REPORT.historicalImportability,
        summaryPresent: true,
        supportedWindows: 2,
        unsupportedWindows: 1,
        historicalSuccessRate: 0.67,
        totalAttempts: 3,
        successfulImports: 2,
        unsupportedMarkets: 1,
      },
    });

    expect(html).toContain("Historical Importability");
    expect(html).toContain("Supported windows");
    expect(html).toContain("67%");
  });

  it("renders the expansion run history section", () => {
    const html = serializePipelineDashboardHtml(REPORT);

    expect(html).toContain("Expansion Run History");
    expect(html).toContain("984");
    expect(html).toContain("improving");
  });

  it("renders the research diagnostics section", () => {
    const html = serializePipelineDashboardHtml(REPORT);

    expect(html).toContain("Research Diagnostics");
    expect(html).toContain("Near-promising");
    expect(html).toContain("hypothesis-failure-analysis.html");
    expect(html).toContain("not generated");
  });
});
