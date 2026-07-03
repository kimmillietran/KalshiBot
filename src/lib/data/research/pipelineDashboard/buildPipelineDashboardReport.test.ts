import { describe, expect, it } from "vitest";

import {
  buildPipelineDashboardReportFromInputs,
} from "./buildPipelineDashboardReport";
import { loadPipelineDashboardInputs } from "./loadPipelineDashboardInputs";
import { serializePipelineDashboardHtml } from "./serializePipelineDashboardHtml";
import {
  DEFAULT_PIPELINE_DASHBOARD_INPUT_PATHS,
  DEFAULT_RESEARCH_DASHBOARD_HTML_PATH,
  type PipelineDashboardIo,
} from "./pipelineDashboardTypes";

const GENERATED_AT = "2026-07-03T21:00:00.000Z";

type MockFs = {
  files: Record<string, string>;
};

function createIo(mock: MockFs): PipelineDashboardIo {
  return {
    readFile: (path) => mock.files[path] ?? "",
    fileExists: (path) => mock.files[path] !== undefined,
  };
}

function addFile(mock: MockFs, path: string, content: string): void {
  mock.files[path] = content;
}

function createHealthyFixture(): MockFs {
  const mock: MockFs = { files: {} };

  addFile(
    mock,
    DEFAULT_PIPELINE_DASHBOARD_INPUT_PATHS.pipelineSummaryPath,
    JSON.stringify({
      generatedAt: "2026-07-03T20:00:00.000Z",
      status: "succeeded",
      steps: [
        { stepId: "discover", label: "Discover markets", status: "succeeded", durationMs: 5000 },
        { stepId: "sweep", label: "Run strategy sweep", status: "succeeded", durationMs: 60000 },
        { stepId: "hypotheses", label: "Generate hypotheses", status: "succeeded", durationMs: 1000 },
      ],
    }),
  );

  addFile(
    mock,
    DEFAULT_PIPELINE_DASHBOARD_INPUT_PATHS.artifactIndexPath,
    JSON.stringify({
      generatedAt: "2026-07-03T20:10:00.000Z",
      outputPath: DEFAULT_PIPELINE_DASHBOARD_INPUT_PATHS.artifactIndexPath,
      artifacts: [
        {
          artifactId: "pipeline-summary",
          label: "Pipeline summary",
          path: DEFAULT_PIPELINE_DASHBOARD_INPUT_PATHS.pipelineSummaryPath,
          status: "present",
          lastModified: "2026-07-03T20:00:00.000Z",
        },
        {
          artifactId: "data-health",
          label: "Data health",
          path: DEFAULT_PIPELINE_DASHBOARD_INPUT_PATHS.dataHealthPath,
          status: "stale",
          lastModified: "2026-07-03T19:00:00.000Z",
        },
      ],
    }),
  );

  addFile(
    mock,
    DEFAULT_PIPELINE_DASHBOARD_INPUT_PATHS.hypothesisCandidatesPath,
    JSON.stringify({
      generatedAt: "2026-07-03T20:15:00.000Z",
      candidates: [{ candidateId: "hyp-a" }, { candidateId: "hyp-b" }],
    }),
  );

  addFile(
    mock,
    DEFAULT_PIPELINE_DASHBOARD_INPUT_PATHS.hypothesisValidationPath,
    JSON.stringify({
      generatedAt: "2026-07-03T20:20:00.000Z",
      validations: [
        { hypothesisId: "hyp-a", passes: true },
        { hypothesisId: "hyp-b", passes: false },
      ],
      summary: { passingCount: 1, failingCount: 1 },
    }),
  );

  addFile(
    mock,
    DEFAULT_PIPELINE_DASHBOARD_INPUT_PATHS.strategySynthesisPath,
    JSON.stringify({
      generatedAt: "2026-07-03T20:25:00.000Z",
      strategies: [
        {
          strategyId: "synth-a",
          hypothesisId: "hyp-a",
          promotionStatus: "candidate",
        },
      ],
      summary: {
        synthesizedCount: 1,
        promotionCounts: { experimental: 0, candidate: 1, rejected: 0 },
      },
    }),
  );

  addFile(
    mock,
    DEFAULT_PIPELINE_DASHBOARD_INPUT_PATHS.harnessResultsPath,
    JSON.stringify({
      completedAt: "2026-07-03T20:30:00.000Z",
      evaluatedStrategies: 1,
      successfulRuns: 2,
      results: [
        {
          synthesizedStrategyId: "synth-a",
          hypothesisId: "hyp-a",
          status: "success",
        },
        {
          synthesizedStrategyId: "synth-a",
          hypothesisId: "hyp-a",
          status: "success",
        },
      ],
    }),
  );

  addFile(
    mock,
    DEFAULT_PIPELINE_DASHBOARD_INPUT_PATHS.strategyLeaderboardPath,
    JSON.stringify({
      generatedAt: "2026-07-03T20:05:00.000Z",
      rankBy: "totalPnL",
      strategies: [
        { rank: 1, strategyId: "simple-momentum", totalPnlCents: 125000 },
        { rank: 2, strategyId: "noop", totalPnlCents: 0 },
      ],
    }),
  );

  addFile(
    mock,
    DEFAULT_PIPELINE_DASHBOARD_INPUT_PATHS.dataHealthPath,
    JSON.stringify({
      generatedAt: "2026-07-03T20:35:00.000Z",
      outputPath: DEFAULT_PIPELINE_DASHBOARD_INPUT_PATHS.dataHealthPath,
      pipelineCoverage: { calibrationReports: 6, researchOutputs: 100 },
      researchCoverage: {
        calibrationCoveragePct: 75.5,
        mispricingAtlasPresent: true,
      },
      artifactFreshness: { staleDependencyWarnings: [{ message: "stale leaderboard" }] },
      stageStatuses: [
        { stageLabel: "Research execution", status: "green", reason: "ok" },
        { stageLabel: "Calibration reports", status: "yellow", reason: "low coverage" },
      ],
      recommendations: [{ action: "Rebuild calibration", reason: "Coverage low" }],
    }),
  );

  addFile(
    mock,
    "data/research-results/mispricing-atlas.json",
    JSON.stringify({
      sampleCounts: { totalAtlasObservations: 44820 },
    }),
  );

  return mock;
}

describe("buildPipelineDashboardReport", () => {
  it("builds an empty dashboard when no artifacts exist", () => {
    const inputs = loadPipelineDashboardInputs(createIo({ files: {} }), DEFAULT_PIPELINE_DASHBOARD_INPUT_PATHS);
    const report = buildPipelineDashboardReportFromInputs(
      GENERATED_AT,
      DEFAULT_RESEARCH_DASHBOARD_HTML_PATH,
      DEFAULT_PIPELINE_DASHBOARD_INPUT_PATHS,
      inputs,
    );

    expect(report.pipelineStatus.pipelineStatus).toBe("unknown");
    expect(report.hypothesisSummary.hypothesisCount).toBe(0);
    expect(report.strategySummary.topCandidateStrategyId).toBeNull();
    expect(serializePipelineDashboardHtml(report)).toContain("Research Pipeline Dashboard");
  });

  it("summarizes a healthy full pipeline", () => {
    const inputs = loadPipelineDashboardInputs(
      createIo(createHealthyFixture()),
      DEFAULT_PIPELINE_DASHBOARD_INPUT_PATHS,
    );
    const report = buildPipelineDashboardReportFromInputs(
      GENERATED_AT,
      DEFAULT_RESEARCH_DASHBOARD_HTML_PATH,
      DEFAULT_PIPELINE_DASHBOARD_INPUT_PATHS,
      inputs,
    );

    expect(report.pipelineStatus.pipelineStatus).toBe("succeeded");
    expect(report.pipelineStatus.durationMs).toBe(66000);
    expect(report.pipelineStatus.completedSteps).toEqual([
      "Discover markets",
      "Generate hypotheses",
      "Run strategy sweep",
    ]);
    expect(report.artifactHealth.present).toBe(1);
    expect(report.artifactHealth.stale).toBe(1);
    expect(report.hypothesisSummary).toEqual({
      hypothesisCount: 2,
      validatedCount: 1,
      promotedCount: 1,
      rejectedCount: 1,
    });
    expect(report.strategySummary.synthesizedStrategies).toBe(1);
    expect(report.strategySummary.executedStrategies).toBe(1);
    expect(report.strategySummary.topCandidateStrategyId).toBe("simple-momentum");
    expect(report.researchHealth.calibrationCoveragePct).toBe(75.5);
    expect(report.researchHealth.atlasObservations).toBe(44820);
  });

  it("derives artifact health from data health when the artifact index is missing", () => {
    const mock = createHealthyFixture();
    delete mock.files[DEFAULT_PIPELINE_DASHBOARD_INPUT_PATHS.artifactIndexPath];

    const report = buildPipelineDashboardReportFromInputs(
      GENERATED_AT,
      DEFAULT_RESEARCH_DASHBOARD_HTML_PATH,
      DEFAULT_PIPELINE_DASHBOARD_INPUT_PATHS,
      loadPipelineDashboardInputs(createIo(mock), DEFAULT_PIPELINE_DASHBOARD_INPUT_PATHS),
    );

    expect(report.artifactHealth.artifactIndexPresent).toBe(false);
    expect(report.artifactHealth.entries.length).toBe(2);
    expect(report.artifactHealth.stale).toBeGreaterThanOrEqual(2);
  });

  it("falls back to harness summary path when harness-results.json is missing", () => {
    const mock = createHealthyFixture();
    const harnessJson = mock.files[DEFAULT_PIPELINE_DASHBOARD_INPUT_PATHS.harnessResultsPath]!;
    delete mock.files[DEFAULT_PIPELINE_DASHBOARD_INPUT_PATHS.harnessResultsPath];
    addFile(
      mock,
      DEFAULT_PIPELINE_DASHBOARD_INPUT_PATHS.harnessSummaryFallbackPath,
      harnessJson,
    );

    const report = buildPipelineDashboardReportFromInputs(
      GENERATED_AT,
      DEFAULT_RESEARCH_DASHBOARD_HTML_PATH,
      DEFAULT_PIPELINE_DASHBOARD_INPUT_PATHS,
      loadPipelineDashboardInputs(createIo(mock), DEFAULT_PIPELINE_DASHBOARD_INPUT_PATHS),
    );

    expect(report.strategySummary.executedStrategies).toBe(1);
  });

  it("serializes deterministic HTML sections", () => {
    const report = buildPipelineDashboardReportFromInputs(
      GENERATED_AT,
      DEFAULT_RESEARCH_DASHBOARD_HTML_PATH,
      DEFAULT_PIPELINE_DASHBOARD_INPUT_PATHS,
      loadPipelineDashboardInputs(createIo(createHealthyFixture()), DEFAULT_PIPELINE_DASHBOARD_INPUT_PATHS),
    );
    const html = serializePipelineDashboardHtml(report);

    expect(html).toContain("Pipeline status");
    expect(html).toContain("Artifact health");
    expect(html).toContain("Hypothesis summary");
    expect(html).toContain("Strategy summary");
    expect(html).toContain("Research health");
    expect(html).toContain("research-artifact-index.json");
  });
});
