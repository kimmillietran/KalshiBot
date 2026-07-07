import { describe, expect, it } from "vitest";

import {
  buildResearchWorkflowReport,
  compareWorkflowActions,
  determineHypothesisWorkflowAction,
  loadResearchWorkflowInputs,
  serializeResearchWorkflowHtml,
  serializeResearchWorkflowReport,
} from "./index";
import { DEFAULT_RESEARCH_WORKFLOW_INPUT_PATHS } from "./researchWorkflowTypes";

const GENERATED_AT = "2026-07-06T04:52:00.000Z";
const OUTPUT_PATH = "data/research-results/research-workflow.json";
const HTML_PATH = "data/reports/research-workflow.html";

function createMemoryIo(files: Record<string, string> = {}) {
  return {
    readFile: (path: string) => files[path] ?? "",
    fileExists: (path: string) => path in files,
  };
}

function createFullFixture(): Record<string, string> {
  return {
    [DEFAULT_RESEARCH_WORKFLOW_INPUT_PATHS.hypothesisFailureAnalysisPath]: JSON.stringify({
      generatedAt: GENERATED_AT,
      analyses: [
        {
          hypothesisId: "hyp-alpha",
          hypothesis: "Alpha fade hypothesis",
          passes: false,
          robustnessScore: 58,
          priorityRank: 1,
          priorityCategory: "near-promising",
          recommendedNextAction: "strategy-synthesis-investigation",
          failureReasons: [{ category: "poor-month-stability", summary: "Weak April" }],
        },
        {
          hypothesisId: "hyp-beta",
          hypothesis: "Beta coverage blocked",
          passes: false,
          robustnessScore: 22,
          priorityRank: 2,
          priorityCategory: "blocked-by-coverage",
          recommendedNextAction: "collect-more-data",
          failureReasons: [
            { category: "insufficient-observations", summary: "Too few markets" },
          ],
        },
        {
          hypothesisId: "hyp-gamma",
          hypothesis: "Gamma spurious",
          passes: false,
          robustnessScore: 18,
          priorityRank: 3,
          priorityCategory: "likely-spurious",
          recommendedNextAction: "lower-priority",
          failureReasons: [{ category: "below-pass-threshold", summary: "Low score" }],
        },
      ],
      summary: { nearPromisingCount: 1, totalHypotheses: 3 },
    }),
    [DEFAULT_RESEARCH_WORKFLOW_INPUT_PATHS.derivedSettlementSensitivityPath]: JSON.stringify({
      entries: [
        {
          hypothesisId: "hyp-alpha",
          recommendation: "investigate-derived-settlement",
          deltaRobustness: -12,
        },
      ],
    }),
    [DEFAULT_RESEARCH_WORKFLOW_INPUT_PATHS.hypothesisRefinementsPath]: JSON.stringify({
      refinements: [
        {
          parentHypothesisId: "hyp-alpha",
          refinementId: "ref-alpha-1",
          refinedHypothesis: "Alpha with tighter bucket",
        },
      ],
      summary: { totalRefinements: 1 },
    }),
    [DEFAULT_RESEARCH_WORKFLOW_INPUT_PATHS.refinementHypothesisCandidatesPath]: JSON.stringify({
      candidates: [
        {
          parentHypothesisId: "hyp-alpha",
          hypothesisId: "hyp-alpha-ref-1",
          candidateId: "cand-alpha-1",
        },
      ],
    }),
    [DEFAULT_RESEARCH_WORKFLOW_INPUT_PATHS.strategySynthesisDebugPath]: JSON.stringify({
      summary: {
        funnel: {
          hypothesisCandidates: 5,
          synthesisCandidates: 2,
          harnessEligible: 1,
          harnessEvaluated: 0,
        },
      },
      traces: [
        {
          hypothesisId: "hyp-alpha",
          harnessEligible: true,
          harnessEvaluated: false,
          funnelStageReached: "synthesis-candidate",
          rejectionCategories: ["harness-filter-excluded"],
          rejectionReasons: ["Month-level edge persistence is weak (33%)."],
          robustnessScore: 58,
          validationPasses: false,
        },
        {
          hypothesisId: "hyp-beta",
          harnessEligible: false,
          harnessEvaluated: false,
          funnelStageReached: "validation-failed",
        },
      ],
    }),
    [DEFAULT_RESEARCH_WORKFLOW_INPUT_PATHS.monthRegimeAnalysisPath]: JSON.stringify({
      entries: [
        {
          hypothesisId: "hyp-alpha",
          monthInstability: true,
          summary: "April dominates edge",
        },
      ],
    }),
    [DEFAULT_RESEARCH_WORKFLOW_INPUT_PATHS.harnessSummaryPath]: JSON.stringify({
      evaluatedStrategies: 0,
      results: [],
    }),
  };
}

describe("researchWorkflow", () => {
  it("builds a report when all artifacts are present", () => {
    const io = createMemoryIo(createFullFixture());
    const loadedInputs = loadResearchWorkflowInputs(
      io,
      DEFAULT_RESEARCH_WORKFLOW_INPUT_PATHS,
    );
    const report = buildResearchWorkflowReport({
      generatedAt: GENERATED_AT,
      outputPath: OUTPUT_PATH,
      htmlOutputPath: HTML_PATH,
      inputPaths: DEFAULT_RESEARCH_WORKFLOW_INPUT_PATHS,
      loadedInputs,
    });

    expect(report.summary.artifactsAvailable).toBe(7);
    expect(report.pipelines).toHaveLength(3);
    expect(report.pipelines[0]?.hypothesisId).toBe("hyp-alpha");
    expect(report.pipelines[0]?.recommendedNextAction).toBe(
      "validate-refinement-candidates",
    );
    expect(report.queue[0]?.action).toBe("validate-refinement-candidates");
    expect(report.funnel.nearPromisingHypotheses).toBe(1);
    expect(serializeResearchWorkflowHtml(report)).toContain("Research Workflow");
  });

  it("handles partial artifacts without failing", () => {
    const io = createMemoryIo({
      [DEFAULT_RESEARCH_WORKFLOW_INPUT_PATHS.hypothesisFailureAnalysisPath]:
        JSON.stringify({
          analyses: [
            {
              hypothesisId: "hyp-only",
              hypothesis: "Only failure analysis",
              passes: false,
              robustnessScore: 40,
              priorityRank: 1,
              priorityCategory: "needs-more-data",
              recommendedNextAction: "collect-more-data",
              failureReasons: [],
            },
          ],
        }),
    });

    const loadedInputs = loadResearchWorkflowInputs(
      io,
      DEFAULT_RESEARCH_WORKFLOW_INPUT_PATHS,
    );
    const report = buildResearchWorkflowReport({
      generatedAt: GENERATED_AT,
      outputPath: OUTPUT_PATH,
      htmlOutputPath: HTML_PATH,
      inputPaths: DEFAULT_RESEARCH_WORKFLOW_INPUT_PATHS,
      loadedInputs,
    });

    expect(report.summary.artifactsAvailable).toBe(1);
    expect(report.pipelines).toHaveLength(1);
    expect(report.pipelines[0]?.recommendedNextAction).toBe(
      "gather-additional-history",
    );
  });

  it("handles no artifacts with an empty queue", () => {
    const io = createMemoryIo();
    const loadedInputs = loadResearchWorkflowInputs(
      io,
      DEFAULT_RESEARCH_WORKFLOW_INPUT_PATHS,
    );
    const report = buildResearchWorkflowReport({
      generatedAt: GENERATED_AT,
      outputPath: OUTPUT_PATH,
      htmlOutputPath: HTML_PATH,
      inputPaths: DEFAULT_RESEARCH_WORKFLOW_INPUT_PATHS,
      loadedInputs,
    });

    expect(report.summary.artifactsAvailable).toBe(0);
    expect(report.pipelines).toHaveLength(0);
    expect(report.queue).toHaveLength(0);
    expect(report.summary.nextRecommendedMilestone).toBeNull();
  });

  it("orders pipelines deterministically by priority rank then hypothesis id", () => {
    const io = createMemoryIo({
      [DEFAULT_RESEARCH_WORKFLOW_INPUT_PATHS.hypothesisFailureAnalysisPath]:
        JSON.stringify({
          analyses: [
            {
              hypothesisId: "hyp-zulu",
              hypothesis: "Zulu",
              passes: false,
              robustnessScore: 30,
              priorityRank: 2,
              priorityCategory: "needs-more-data",
              recommendedNextAction: "collect-more-data",
              failureReasons: [],
            },
            {
              hypothesisId: "hyp-alpha",
              hypothesis: "Alpha",
              passes: false,
              robustnessScore: 55,
              priorityRank: 1,
              priorityCategory: "near-promising",
              recommendedNextAction: "inspect-month-breakdown",
              failureReasons: [
                { category: "poor-month-stability", summary: "Unstable" },
              ],
            },
            {
              hypothesisId: "hyp-bravo",
              hypothesis: "Bravo",
              passes: false,
              robustnessScore: 55,
              priorityRank: 1,
              priorityCategory: "near-promising",
              recommendedNextAction: "strategy-synthesis-investigation",
              failureReasons: [],
            },
          ],
        }),
      [DEFAULT_RESEARCH_WORKFLOW_INPUT_PATHS.strategySynthesisDebugPath]:
        JSON.stringify({
          traces: [
            {
              hypothesisId: "hyp-bravo",
              harnessEligible: true,
              harnessEvaluated: false,
              funnelStageReached: "synthesis-candidate",
            },
          ],
        }),
    });

    const loadedInputs = loadResearchWorkflowInputs(
      io,
      DEFAULT_RESEARCH_WORKFLOW_INPUT_PATHS,
    );
    const report = buildResearchWorkflowReport({
      generatedAt: GENERATED_AT,
      outputPath: OUTPUT_PATH,
      htmlOutputPath: HTML_PATH,
      inputPaths: DEFAULT_RESEARCH_WORKFLOW_INPUT_PATHS,
      loadedInputs,
    });

    expect(report.pipelines.map((pipeline) => pipeline.hypothesisId)).toEqual([
      "hyp-alpha",
      "hyp-bravo",
      "hyp-zulu",
    ]);
  });

  it("prioritizes queue actions in the required order", () => {
    expect(
      compareWorkflowActions("validate-refinement-candidates", "deprioritize"),
    ).toBeLessThan(0);
    expect(
      compareWorkflowActions("run-research-only-harness", "investigate-month-instability"),
    ).toBeLessThan(0);
    expect(
      compareWorkflowActions("investigate-month-instability", "gather-additional-history"),
    ).toBeLessThan(0);
    expect(
      compareWorkflowActions("gather-additional-history", "deprioritize"),
    ).toBeLessThan(0);
  });

  it("maps recommendation signals to the highest-priority applicable action", () => {
    expect(
      determineHypothesisWorkflowAction({
        refinementsAvailable: 1,
        registeredChildren: 0,
        harnessEligible: true,
        harnessEvaluated: false,
        failureCategories: ["poor-month-stability"],
        priorityCategory: "near-promising",
        recommendedNextAction: "inspect-month-breakdown",
        monthRegimeUnstable: true,
        robustnessScore: 58,
        harnessFilterExcluded: true,
        synthesisRejectionReasons: [],
      }),
    ).toBe("validate-refinement-candidates");

    expect(
      determineHypothesisWorkflowAction({
        refinementsAvailable: 0,
        registeredChildren: 0,
        harnessEligible: true,
        harnessEvaluated: false,
        failureCategories: [],
        priorityCategory: "near-promising",
        recommendedNextAction: "strategy-synthesis-investigation",
        monthRegimeUnstable: null,
        robustnessScore: 58,
        harnessFilterExcluded: false,
        synthesisRejectionReasons: [],
      }),
    ).toBe("run-research-only-harness");

    expect(
      determineHypothesisWorkflowAction({
        refinementsAvailable: 0,
        registeredChildren: 0,
        harnessEligible: false,
        harnessEvaluated: false,
        failureCategories: ["poor-month-stability"],
        priorityCategory: "near-promising",
        recommendedNextAction: "inspect-month-breakdown",
        monthRegimeUnstable: true,
        robustnessScore: 42,
        harnessFilterExcluded: false,
        synthesisRejectionReasons: ["Month-level edge persistence is weak (33%)."],
      }),
    ).toBe("investigate-month-instability");

    expect(
      determineHypothesisWorkflowAction({
        refinementsAvailable: 0,
        registeredChildren: 0,
        harnessEligible: false,
        harnessEvaluated: false,
        failureCategories: ["insufficient-observations"],
        priorityCategory: "blocked-by-coverage",
        recommendedNextAction: "collect-more-data",
        monthRegimeUnstable: null,
        robustnessScore: 22,
        harnessFilterExcluded: false,
        synthesisRejectionReasons: [],
      }),
    ).toBe("gather-additional-history");

    expect(
      determineHypothesisWorkflowAction({
        refinementsAvailable: 0,
        registeredChildren: 0,
        harnessEligible: false,
        harnessEvaluated: false,
        failureCategories: [],
        priorityCategory: "likely-spurious",
        recommendedNextAction: "lower-priority",
        monthRegimeUnstable: null,
        robustnessScore: 18,
        harnessFilterExcluded: false,
        synthesisRejectionReasons: [],
      }),
    ).toBe("deprioritize");
  });

  it("serializes stable JSON output", () => {
    const io = createMemoryIo(createFullFixture());
    const loadedInputs = loadResearchWorkflowInputs(
      io,
      DEFAULT_RESEARCH_WORKFLOW_INPUT_PATHS,
    );
    const report = buildResearchWorkflowReport({
      generatedAt: GENERATED_AT,
      outputPath: OUTPUT_PATH,
      htmlOutputPath: HTML_PATH,
      inputPaths: DEFAULT_RESEARCH_WORKFLOW_INPUT_PATHS,
      loadedInputs,
    });

    const first = serializeResearchWorkflowReport(report);
    const second = serializeResearchWorkflowReport(report);
    expect(first).toBe(second);
    expect(JSON.parse(first).queue[0].action).toBe("validate-refinement-candidates");
  });
});
