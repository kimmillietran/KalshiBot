import { describe, expect, it } from "vitest";

import { buildCoveragePhaseSection } from "./buildCoveragePhaseSection";
import {
  DEFAULT_PIPELINE_DASHBOARD_INPUT_PATHS,
  type ParsedPipelineDashboardInputs,
} from "./pipelineDashboardTypes";

const GENERATED_AT = "2026-07-03T21:00:00.000Z";

describe("buildCoveragePhaseSection", () => {
  it("surfaces coverage orchestrator step status and artifact metrics", () => {
    const inputs: ParsedPipelineDashboardInputs = {
      pipelineSummary: null,
      fullResearchSummary: {
        generatedAt: GENERATED_AT,
        status: "partial",
        steps: [
          {
            stepId: "coverage-plan",
            label: "Historical coverage plan",
            status: "failed",
            durationMs: 10,
          },
          {
            stepId: "generate-expansion-import-config",
            label: "Historical expansion import config",
            status: "skipped",
            durationMs: 0,
          },
          {
            stepId: "coverage-validation",
            label: "Coverage-aware validation",
            status: "skipped",
            durationMs: 0,
          },
        ],
      },
      artifactIndex: null,
      hypothesisCandidates: null,
      hypothesisValidation: null,
      strategySynthesis: null,
      harnessResults: null,
      strategyLeaderboard: null,
      dataHealth: null,
      mispricingAtlas: null,
      historicalCoveragePlan: {
        generatedAt: GENERATED_AT,
        summary: {
          currentMarketCount: 499,
          uniqueTradingDays: 2,
          missingMonths: ["2026-03", "2026-06"],
          recommendedImportWindows: [{}, {}],
        },
      },
      historicalExpansionConfig: null,
      coverageValidation: null,
    };

    const section = buildCoveragePhaseSection({
      generatedAt: GENERATED_AT,
      outputPath: "data/reports/research-dashboard.html",
      inputPaths: DEFAULT_PIPELINE_DASHBOARD_INPUT_PATHS,
      inputs,
    });

    expect(section.plan.orchestratorStepStatus).toBe("failed");
    expect(section.expansionConfig.orchestratorStepStatus).toBe("skipped");
    expect(section.currentMarketCount).toBe(499);
    expect(section.missingMonthCount).toBe(2);
    expect(section.recommendedImportWindowCount).toBe(2);
    expect(section.summary).toContain("499 markets");
  });
});
