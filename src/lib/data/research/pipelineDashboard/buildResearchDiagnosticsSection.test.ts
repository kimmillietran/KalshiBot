import { describe, expect, it } from "vitest";

import { buildResearchDiagnosticsSection } from "@/lib/data/research/researchDiagnostics";
import { loadPipelineDashboardInputs } from "./loadPipelineDashboardInputs";
import { buildPipelineDashboardReportFromInputs } from "./buildPipelineDashboardReport";
import { serializePipelineDashboardHtml } from "./serializePipelineDashboardHtml";
import {
  DEFAULT_PIPELINE_DASHBOARD_INPUT_PATHS,
  DEFAULT_RESEARCH_DASHBOARD_HTML_PATH,
  type PipelineDashboardIo,
} from "./pipelineDashboardTypes";
import { DEFAULT_RESEARCH_DIAGNOSTICS_INPUT_PATHS } from "@/lib/data/research/researchDiagnostics/researchDiagnosticsTypes";

const GENERATED_AT = "2026-07-07T04:30:00.000Z";

type MockFs = {
  files: Record<string, string>;
};

function createIo(mock: MockFs): PipelineDashboardIo {
  return {
    readFile: (path) => mock.files[path] ?? "",
    fileExists: (path) => mock.files[path] !== undefined,
  };
}

function createDiagnosticFixtures(mock: MockFs): void {
  mock.files[DEFAULT_RESEARCH_DIAGNOSTICS_INPUT_PATHS.hypothesisFailureAnalysisPath] =
    JSON.stringify({
      generatedAt: "2026-07-07T03:29:15.026Z",
      htmlOutputPath: "data/reports/hypothesis-failure-analysis.html",
      summary: {
        nearPromisingCount: 2,
        highestRobustnessScore: 59,
        totalHypotheses: 5,
      },
    });
  mock.files[DEFAULT_RESEARCH_DIAGNOSTICS_INPUT_PATHS.derivedSettlementSensitivityPath] =
    JSON.stringify({
      generatedAt: "2026-07-07T04:00:00.000Z",
      htmlOutputPath: "data/reports/derived-settlement-sensitivity.html",
      summary: { derivedSensitiveHypothesisCount: 2 },
    });
  mock.files[DEFAULT_RESEARCH_DIAGNOSTICS_INPUT_PATHS.hypothesisRefinementsPath] =
    JSON.stringify({
      generatedAt: "2026-07-07T04:05:00.000Z",
      htmlOutputPath: "data/reports/hypothesis-refinements.html",
      summary: { refinementCandidateCount: 3 },
    });
  mock.files[DEFAULT_RESEARCH_DIAGNOSTICS_INPUT_PATHS.strategySynthesisDebugPath] =
    JSON.stringify({
      generatedAt: "2026-07-07T04:10:00.000Z",
      htmlOutputPath: "data/reports/strategy-synthesis-debug.html",
      summary: { funnelStatus: "candidate-ready", harnessCandidateCount: 4 },
    });
}

describe("pipeline dashboard research diagnostics", () => {
  it("renders diagnostics with artifact links when all artifacts are present", () => {
    const mock: MockFs = { files: {} };
    createDiagnosticFixtures(mock);

    const inputs = loadPipelineDashboardInputs(createIo(mock), DEFAULT_PIPELINE_DASHBOARD_INPUT_PATHS);
    const report = buildPipelineDashboardReportFromInputs(
      GENERATED_AT,
      DEFAULT_RESEARCH_DASHBOARD_HTML_PATH,
      DEFAULT_PIPELINE_DASHBOARD_INPUT_PATHS,
      inputs,
    );
    const html = serializePipelineDashboardHtml(report);

    expect(report.researchDiagnostics.availableCount).toBe(4);
    expect(report.researchDiagnostics.nearPromisingHypothesisCount).toBe(2);
    expect(html).toContain("Research Diagnostics");
    expect(html).toContain("hypothesis-failure-analysis.json");
    expect(html).toContain("hypothesis-failure-analysis.html");
    expect(html).toContain("derived-settlement-sensitivity.html");
    expect(html).toContain("candidate-ready");
  });

  it("renders gracefully when diagnostics are missing", () => {
    const mock: MockFs = { files: {} };
    const inputs = loadPipelineDashboardInputs(createIo(mock), DEFAULT_PIPELINE_DASHBOARD_INPUT_PATHS);
    const report = buildPipelineDashboardReportFromInputs(
      GENERATED_AT,
      DEFAULT_RESEARCH_DASHBOARD_HTML_PATH,
      DEFAULT_PIPELINE_DASHBOARD_INPUT_PATHS,
      inputs,
    );
    const html = serializePipelineDashboardHtml(report);

    expect(report.researchDiagnostics.availableCount).toBe(0);
    expect(report.researchDiagnostics.nearPromisingHypothesisCount).toBeNull();
    expect(html).toContain("Research Diagnostics");
    expect(html).toContain("not generated");
  });

  it("summary metrics match source JSON", () => {
    const mock: MockFs = {
      files: {
        [DEFAULT_RESEARCH_DIAGNOSTICS_INPUT_PATHS.hypothesisFailureAnalysisPath]:
          JSON.stringify({
            generatedAt: "2026-07-07T03:29:15.026Z",
            summary: { nearPromisingCount: 2, highestRobustnessScore: 59 },
          }),
      },
    };

    const loaded = loadPipelineDashboardInputs(
      createIo(mock),
      DEFAULT_PIPELINE_DASHBOARD_INPUT_PATHS,
    );

    const section = buildResearchDiagnosticsSection({
      inputPaths: DEFAULT_RESEARCH_DIAGNOSTICS_INPUT_PATHS,
      loaded: loaded.loadedResearchDiagnostics,
    });

    expect(section.nearPromisingHypothesisCount).toBe(2);
    expect(section.highestRobustnessScore).toBe(59);
  });
});
