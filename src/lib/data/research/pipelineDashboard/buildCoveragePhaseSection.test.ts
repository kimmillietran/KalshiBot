import { describe, expect, it } from "vitest";

import { buildCoveragePhaseSection } from "./buildCoveragePhaseSection";
import {
  DEFAULT_PIPELINE_DASHBOARD_INPUT_PATHS,
  type ParsedPipelineDashboardInputs,
} from "./pipelineDashboardTypes";

const GENERATED_AT = "2026-07-03T21:00:00.000Z";

describe("buildCoveragePhaseSection", () => {
  it("surfaces read-only orchestrator mode by default", () => {
    const inputs: ParsedPipelineDashboardInputs = {
      pipelineSummary: null,
      fullResearchSummary: {
        generatedAt: GENERATED_AT,
        status: "succeeded",
        steps: [
          {
            stepId: "coverage-plan",
            label: "Historical coverage plan",
            status: "succeeded",
            durationMs: 10,
          },
        ],
      },
      fullResearchOrchestrator: {
        runMode: "read-only",
        executeExpansionImport: false,
      },
      artifactIndex: null,
      hypothesisCandidates: null,
      hypothesisValidation: null,
      strategySynthesis: null,
      harnessResults: null,
      strategyLeaderboard: null,
      dataHealth: null,
      mispricingAtlas: null,
      historicalCoveragePlan: null,
      historicalExpansionConfig: null,
      coverageValidation: null,
      historicalExpansionImportSummary: null,
      expansionRebuildSummary: null,
    };

    const section = buildCoveragePhaseSection({
      generatedAt: GENERATED_AT,
      outputPath: "data/reports/research-dashboard.html",
      inputPaths: DEFAULT_PIPELINE_DASHBOARD_INPUT_PATHS,
      inputs,
    });

    expect(section.runMode).toBe("read-only");
    expect(section.summary).toContain("Read-only orchestrator run");
  });

  it("surfaces import execution mode and step statuses", () => {
    const inputs: ParsedPipelineDashboardInputs = {
      pipelineSummary: null,
      fullResearchSummary: {
        generatedAt: GENERATED_AT,
        status: "partial",
        steps: [
          {
            stepId: "execute-expansion-import",
            label: "Execute historical expansion import",
            status: "succeeded",
            durationMs: 100,
          },
          {
            stepId: "rebuild-after-expansion",
            label: "Rebuild fixtures and research after expansion",
            status: "failed",
            durationMs: 50,
          },
        ],
      },
      fullResearchOrchestrator: {
        runMode: "import-executing",
        executeExpansionImport: true,
      },
      artifactIndex: null,
      hypothesisCandidates: null,
      hypothesisValidation: null,
      strategySynthesis: null,
      harnessResults: null,
      strategyLeaderboard: null,
      dataHealth: null,
      mispricingAtlas: null,
      historicalCoveragePlan: null,
      historicalExpansionConfig: null,
      coverageValidation: null,
      historicalExpansionImportSummary: { generatedAt: GENERATED_AT },
      expansionRebuildSummary: null,
    };

    const section = buildCoveragePhaseSection({
      generatedAt: GENERATED_AT,
      outputPath: "data/reports/research-dashboard.html",
      inputPaths: DEFAULT_PIPELINE_DASHBOARD_INPUT_PATHS,
      inputs,
    });

    expect(section.runMode).toBe("import-executing");
    expect(section.expansionImportExecution.orchestratorStepStatus).toBe("succeeded");
    expect(section.rebuildAfterExpansion.orchestratorStepStatus).toBe("failed");
    expect(section.summary).toContain("Import execution enabled");
  });
});
