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
});
