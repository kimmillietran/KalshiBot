import { describe, expect, it } from "vitest";

import { buildHypothesisEvolutionSection } from "./buildHypothesisEvolutionSection";
import { buildPipelineDashboardReportFromInputs } from "./buildPipelineDashboardReport";
import { loadPipelineDashboardInputs } from "./loadPipelineDashboardInputs";
import { serializePipelineDashboardHtml } from "./serializePipelineDashboardHtml";
import {
  DEFAULT_PIPELINE_DASHBOARD_INPUT_PATHS,
  DEFAULT_RESEARCH_DASHBOARD_HTML_PATH,
  type PipelineDashboardIo,
} from "./pipelineDashboardTypes";
import { DEFAULT_HYPOTHESIS_HISTORY_MAX_RUNS } from "@/lib/data/research/hypothesisEvolution/hypothesisEvolutionTypes";

const GENERATED_AT = "2026-07-05T12:00:00.000Z";

function createIo(files: Record<string, string>): PipelineDashboardIo {
  return {
    readFile: (path) => files[path] ?? "",
    fileExists: (path) => files[path] !== undefined,
  };
}

describe("buildHypothesisEvolutionSection", () => {
  it("returns empty highlights when history is missing", () => {
    const section = buildHypothesisEvolutionSection(null);

    expect(section.historyPresent).toBe(false);
    expect(section.runCount).toBe(0);
    expect(section.strongestImprovingHypothesis).toBeNull();
  });

  it("summarizes strengthening and regressed hypotheses", () => {
    const section = buildHypothesisEvolutionSection({
      generatedAt: GENERATED_AT,
      outputPath: "data/research-results/hypothesis-history.json",
      htmlOutputPath: "data/reports/hypothesis-evolution.html",
      maxRunsRetained: DEFAULT_HYPOTHESIS_HISTORY_MAX_RUNS,
      runs: [
        {
          runId: "run-1",
          marketCount: 100,
          snapshotsByHypothesisId: {
            "hyp-a": {
              timestamp: "2026-07-01T10:00:00.000Z",
              hypothesis: "Improving",
              marketCount: 100,
              observationCount: 100,
              robustnessScore: 40,
              calibrationError: 0.1,
              confidence: "medium",
              monthCount: 2,
              uniqueTradingDays: 10,
              regimesWithData: 2,
              regimesWithEdge: 1,
              monthPersistenceRate: 0.4,
              leaveOneMonthOutStdDev: 0.05,
              classification: "promising-needs-more-history",
              passes: false,
              promotionEligible: false,
              candidateRank: 2,
            },
            "hyp-b": {
              timestamp: "2026-07-01T10:00:00.000Z",
              hypothesis: "Weakening",
              marketCount: 100,
              observationCount: 200,
              robustnessScore: 75,
              calibrationError: 0.08,
              confidence: "high",
              monthCount: 3,
              uniqueTradingDays: 15,
              regimesWithData: 3,
              regimesWithEdge: 2,
              monthPersistenceRate: 0.7,
              leaveOneMonthOutStdDev: 0.04,
              classification: "robust-enough-to-test",
              passes: true,
              promotionEligible: true,
              candidateRank: 1,
            },
          },
        },
        {
          runId: "run-2",
          marketCount: 150,
          snapshotsByHypothesisId: {
            "hyp-a": {
              timestamp: "2026-07-02T10:00:00.000Z",
              hypothesis: "Improving",
              marketCount: 150,
              observationCount: 500,
              robustnessScore: 70,
              calibrationError: 0.07,
              confidence: "high",
              monthCount: 4,
              uniqueTradingDays: 20,
              regimesWithData: 4,
              regimesWithEdge: 3,
              monthPersistenceRate: 0.8,
              leaveOneMonthOutStdDev: 0.03,
              classification: "robust-enough-to-test",
              passes: true,
              promotionEligible: true,
              candidateRank: 1,
            },
            "hyp-b": {
              timestamp: "2026-07-02T10:00:00.000Z",
              hypothesis: "Weakening",
              marketCount: 150,
              observationCount: 220,
              robustnessScore: 58,
              calibrationError: 0.11,
              confidence: "medium",
              monthCount: 3,
              uniqueTradingDays: 15,
              regimesWithData: 3,
              regimesWithEdge: 1,
              monthPersistenceRate: 0.5,
              leaveOneMonthOutStdDev: 0.06,
              classification: "promising-needs-more-history",
              passes: false,
              promotionEligible: false,
              candidateRank: 2,
            },
          },
        },
      ],
    });

    expect(section.runCount).toBe(2);
    expect(section.strengtheningCount).toBe(1);
    expect(section.weakeningCount).toBe(1);
    expect(section.strongestImprovingHypothesis).toBe("Improving");
    expect(section.approachingPromotion).toContain("hyp-a");
    expect(section.regressedHypotheses).toContain("hyp-b");
  });
});

describe("pipeline dashboard hypothesis evolution rendering", () => {
  it("renders the Hypothesis Evolution section in dashboard HTML", () => {
    const files: Record<string, string> = {
      [DEFAULT_PIPELINE_DASHBOARD_INPUT_PATHS.hypothesisHistoryPath]: JSON.stringify({
        generatedAt: GENERATED_AT,
        outputPath: DEFAULT_PIPELINE_DASHBOARD_INPUT_PATHS.hypothesisHistoryPath,
        htmlOutputPath: "data/reports/hypothesis-evolution.html",
        maxRunsRetained: 100,
        runs: [
          {
            runId: "run-1",
            marketCount: 100,
            snapshotsByHypothesisId: {
              "hyp-a": {
                timestamp: "2026-07-01T10:00:00.000Z",
                hypothesis: "Improving",
                marketCount: 100,
                observationCount: 100,
                robustnessScore: 40,
                calibrationError: 0.1,
                confidence: "medium",
                monthCount: 2,
                uniqueTradingDays: 10,
                regimesWithData: 2,
                regimesWithEdge: 1,
                monthPersistenceRate: 0.4,
                leaveOneMonthOutStdDev: 0.05,
                classification: "promising-needs-more-history",
                passes: false,
                promotionEligible: false,
                candidateRank: 1,
              },
            },
          },
          {
            runId: "run-2",
            marketCount: 150,
            snapshotsByHypothesisId: {
              "hyp-a": {
                timestamp: "2026-07-02T10:00:00.000Z",
                hypothesis: "Improving",
                marketCount: 150,
                observationCount: 500,
                robustnessScore: 70,
                calibrationError: 0.07,
                confidence: "high",
                monthCount: 4,
                uniqueTradingDays: 20,
                regimesWithData: 4,
                regimesWithEdge: 3,
                monthPersistenceRate: 0.8,
                leaveOneMonthOutStdDev: 0.03,
                classification: "robust-enough-to-test",
                passes: true,
                promotionEligible: true,
                candidateRank: 1,
              },
            },
          },
        ],
      }),
    };

    const report = buildPipelineDashboardReportFromInputs(
      GENERATED_AT,
      DEFAULT_RESEARCH_DASHBOARD_HTML_PATH,
      DEFAULT_PIPELINE_DASHBOARD_INPUT_PATHS,
      loadPipelineDashboardInputs(createIo(files), DEFAULT_PIPELINE_DASHBOARD_INPUT_PATHS),
    );
    const html = serializePipelineDashboardHtml(report);

    expect(report.hypothesisEvolution.runCount).toBe(2);
    expect(html).toContain("Hypothesis Evolution");
    expect(html).toContain("Strongest improving");
    expect(html).toContain("hypothesis-evolution.html");
  });
});
