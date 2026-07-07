import { describe, expect, it } from "vitest";

import {
  buildResearchRecommendations,
  compareResearchRecommendationKinds,
} from "./buildResearchRecommendations";
import { buildResearchRecommendationEngineReport } from "./buildResearchRecommendationEngineReport";
import { loadResearchRecommendationInputs } from "./loadResearchRecommendationInputs";
import { serializeResearchRecommendationEngineHtml } from "./serializeResearchRecommendationEngineHtml";
import { serializeResearchRecommendationEngineReport } from "./serializeResearchRecommendationEngineReport";
import { DEFAULT_RESEARCH_RECOMMENDATION_ENGINE_INPUT_PATHS } from "./researchRecommendationEngineTypes";

const GENERATED_AT = "2026-07-07T23:00:00.000Z";
const OUTPUT_PATH = "data/research-results/research-recommendations.json";
const HTML_PATH = "data/reports/research-recommendations.html";

function createMemoryIo(files: Record<string, string> = {}) {
  return {
    readFile: (path: string) => files[path] ?? "",
    fileExists: (path: string) => path in files,
  };
}

function createFullFixture(): Record<string, string> {
  return {
    [DEFAULT_RESEARCH_RECOMMENDATION_ENGINE_INPUT_PATHS.portfolioAnalyticsPath]:
      JSON.stringify({
        entries: [
          {
            researchFamily: "momentum",
            promisingCount: 2,
            candidateCount: 4,
            validationCount: 1,
            observationShare: 0.18,
          },
        ],
      }),
    [DEFAULT_RESEARCH_RECOMMENDATION_ENGINE_INPUT_PATHS.roiAnalysisPath]:
      JSON.stringify({
        entries: [
          {
            researchFamily: "momentum",
            roiScore: 0.82,
            yieldPerHour: 0.71,
          },
          {
            researchFamily: "hour-only",
            roiScore: 0.18,
            yieldPerHour: 0.12,
            candidateYield: 1,
            validationYield: 0,
          },
        ],
      }),
    [DEFAULT_RESEARCH_RECOMMENDATION_ENGINE_INPUT_PATHS.interactionAnalysisPath]:
      JSON.stringify({
        families: [
          {
            familyId: "momentum-volatility",
            label: "Momentum × Volatility",
            interactionStrength: 0.74,
            candidateYield: 0,
            populationRate: 0.52,
            dimensionIds: ["moneyness", "volatility"],
          },
        ],
      }),
    [DEFAULT_RESEARCH_RECOMMENDATION_ENGINE_INPUT_PATHS.dimensionExplorerPath]:
      JSON.stringify({
        dimensions: [
          {
            dimensionId: "probability",
            label: "Probability",
            entropy: 2.1,
            sparsity: 0,
            coverage: 1,
            observationCount: 1000,
          },
          {
            dimensionId: "timeRemaining",
            label: "Time remaining",
            sparsity: 0.75,
            coverage: 0.25,
            observationCount: 500,
          },
        ],
        recommendations: [
          {
            kind: "refine-buckets",
            label: "Refine Time remaining buckets",
            rationale: "Low entropy concentration",
            dimensionId: "timeRemaining",
          },
        ],
      }),
    [DEFAULT_RESEARCH_RECOMMENDATION_ENGINE_INPUT_PATHS.failureAnalysisPath]:
      JSON.stringify({
        summary: { nearPromisingCount: 2 },
        analyses: [
          {
            hypothesisId: "hyp-alpha",
            priorityCategory: "near-promising",
            priorityRank: 1,
            recommendedNextAction: "inspect-month-breakdown",
            robustnessScore: 58,
            failureReasons: [
              { category: "poor-month-stability", summary: "Weak April" },
            ],
          },
        ],
      }),
    [DEFAULT_RESEARCH_RECOMMENDATION_ENGINE_INPUT_PATHS.monthRegimeAnalysisPath]:
      JSON.stringify({
        summary: {
          weekendObservationShare: 0.12,
          weekdayObservationShare: 0.88,
          recommendWeekendSampling: true,
        },
      }),
  };
}

describe("researchRecommendationEngine", () => {
  it("returns an empty recommendation list when no inputs are present", () => {
    const io = createMemoryIo();
    const loadedInputs = loadResearchRecommendationInputs(
      io,
      DEFAULT_RESEARCH_RECOMMENDATION_ENGINE_INPUT_PATHS,
    );
    const recommendations = buildResearchRecommendations(loadedInputs);

    expect(recommendations).toHaveLength(0);
  });

  it("builds recommendations from all diagnostic artifacts", () => {
    const io = createMemoryIo(createFullFixture());
    const loadedInputs = loadResearchRecommendationInputs(
      io,
      DEFAULT_RESEARCH_RECOMMENDATION_ENGINE_INPUT_PATHS,
    );
    const report = buildResearchRecommendationEngineReport({
      generatedAt: GENERATED_AT,
      outputPath: OUTPUT_PATH,
      htmlOutputPath: HTML_PATH,
      inputPaths: DEFAULT_RESEARCH_RECOMMENDATION_ENGINE_INPUT_PATHS,
      loadedInputs,
    });

    expect(report.summary.artifactsAvailable).toBe(6);
    expect(report.recommendations.length).toBeGreaterThan(0);
    expect(report.recommendations[0]?.kind).toBe("recommend-refinement-priority");
    expect(
      report.recommendations.some((entry) => entry.title.includes("Momentum")),
    ).toBe(true);
    expect(
      report.recommendations.some((entry) => entry.kind === "reduce-exploration-focus"),
    ).toBe(true);
    expect(
      report.recommendations.some((entry) => entry.title === "Increase Weekend sampling"),
    ).toBe(true);
    expect(
      report.recommendations.some((entry) => entry.kind === "investigate-interaction"),
    ).toBe(true);
    expect(serializeResearchRecommendationEngineHtml(report)).toContain(
      "Research Recommendations",
    );
  });

  it("orders recommendations deterministically by kind priority", () => {
    const io = createMemoryIo(createFullFixture());
    const loadedInputs = loadResearchRecommendationInputs(
      io,
      DEFAULT_RESEARCH_RECOMMENDATION_ENGINE_INPUT_PATHS,
    );
    const first = buildResearchRecommendations(loadedInputs);
    const second = buildResearchRecommendations(loadedInputs);

    expect(first.map((entry) => `${entry.kind}:${entry.title}`)).toEqual(
      second.map((entry) => `${entry.kind}:${entry.title}`),
    );
    expect(
      compareResearchRecommendationKinds(
        "recommend-refinement-priority",
        "deprioritize-sparse-dimension",
      ),
    ).toBeLessThan(0);
  });

  it("serializes stable JSON output", () => {
    const io = createMemoryIo(createFullFixture());
    const loadedInputs = loadResearchRecommendationInputs(
      io,
      DEFAULT_RESEARCH_RECOMMENDATION_ENGINE_INPUT_PATHS,
    );
    const report = buildResearchRecommendationEngineReport({
      generatedAt: GENERATED_AT,
      outputPath: OUTPUT_PATH,
      htmlOutputPath: HTML_PATH,
      inputPaths: DEFAULT_RESEARCH_RECOMMENDATION_ENGINE_INPUT_PATHS,
      loadedInputs,
    });

    const first = serializeResearchRecommendationEngineReport(report);
    const second = serializeResearchRecommendationEngineReport(report);
    expect(first).toBe(second);
    expect(JSON.parse(first).recommendations[0].explanation).toContain("Failure analysis");
  });

  it("handles partial artifacts without failing", () => {
    const io = createMemoryIo({
      [DEFAULT_RESEARCH_RECOMMENDATION_ENGINE_INPUT_PATHS.dimensionExplorerPath]:
        JSON.stringify({
          dimensions: [
            {
              dimensionId: "volatility",
              label: "Volatility",
              sparsity: 0.8,
              coverage: 0.2,
              observationCount: 10,
            },
          ],
        }),
    });
    const loadedInputs = loadResearchRecommendationInputs(
      io,
      DEFAULT_RESEARCH_RECOMMENDATION_ENGINE_INPUT_PATHS,
    );
    const recommendations = buildResearchRecommendations(loadedInputs);

    expect(loadedInputs.inputStatus.dimensionExplorerPresent).toBe(true);
    expect(
      recommendations.some((entry) => entry.kind === "deprioritize-sparse-dimension"),
    ).toBe(true);
  });

  it("ignores its own output file when used as an input path", () => {
    const io = createMemoryIo({
      [DEFAULT_RESEARCH_RECOMMENDATION_ENGINE_INPUT_PATHS.dimensionExplorerPath]:
        JSON.stringify({
          summary: { topRecommendation: "Self", highConfidenceCount: 0, recommendationCount: 0 },
          recommendations: [],
          inputStatus: { portfolioAnalyticsPresent: false },
        }),
    });
    const loadedInputs = loadResearchRecommendationInputs(
      io,
      DEFAULT_RESEARCH_RECOMMENDATION_ENGINE_INPUT_PATHS,
    );

    expect(loadedInputs.dimensionExplorer).toBeNull();
  });
});
