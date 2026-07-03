import { describe, expect, it } from "vitest";

import {
  classifyCandidatePromotion,
  classifyAllCandidatePromotions,
  resolveCandidatePromotionConfig,
} from "./classifyCandidatePromotion";
import { buildCandidatePromotionReport, serializeCandidatePromotionReport } from "./buildCandidatePromotionReport";
import { loadCandidatePromotionInputs } from "./loadCandidatePromotionInputs";
import { serializeCandidatePromotionHtml } from "./serializeCandidatePromotionHtml";
import type {
  ParsedHarnessStrategyMetrics,
  ParsedSynthesisStrategy,
  ParsedValidationEntry,
} from "./candidatePromotionTypes";
import { DEFAULT_CANDIDATE_PROMOTION_INPUT_PATHS } from "./candidatePromotionTypes";

const GENERATED_AT = "2026-07-03T23:00:00.000Z";

function createStrategy(
  overrides: Partial<ParsedSynthesisStrategy> = {},
): ParsedSynthesisStrategy {
  return {
    strategyId: "synth-atlas-vol-high-over",
    hypothesisId: "atlas-vol-high-over",
    strategyFamily: "calibration-fade",
    promotionStatus: "candidate",
    validationSummary: {
      robustnessScore: 82,
      passes: true,
      observationCount: 40,
    },
    riskNotes: [],
    ...overrides,
  };
}

function createValidation(
  overrides: Partial<ParsedValidationEntry> = {},
): ParsedValidationEntry {
  return {
    hypothesisId: "atlas-vol-high-over",
    robustnessScore: 82,
    passes: true,
    reasons: [],
    observationCount: 40,
    sampleConcentration: {
      singleDayDominated: false,
      largestDayPercent: 0.12,
    },
    ...overrides,
  };
}

function createHarness(
  overrides: Partial<ParsedHarnessStrategyMetrics> = {},
): ParsedHarnessStrategyMetrics {
  return {
    strategyId: "synth-atlas-vol-high-over",
    hypothesisId: "atlas-vol-high-over",
    strategyFamily: "calibration-fade",
    marketRuns: 10,
    successfulRuns: 8,
    failedRuns: 2,
    skippedRuns: 0,
    totalTradeCount: 24,
    netPnlCents: 1800,
    warnings: [],
    ...overrides,
  };
}

describe("classifyCandidatePromotion", () => {
  const config = resolveCandidatePromotionConfig();

  it("rejects strategies that fail validation", () => {
    const entry = classifyCandidatePromotion({
      strategy: createStrategy({ promotionStatus: "experimental" }),
      validation: createValidation({ passes: false, robustnessScore: 40 }),
      harness: createHarness(),
      significance: null,
      config,
    });

    expect(entry.decision).toBe("rejected");
    expect(entry.recommendedNextAction).toBe("reject-permanently");
    expect(entry.blockingIssues).toContain("Hypothesis validation did not pass.");
  });

  it("marks under-sampled strategies as needs-more-data", () => {
    const entry = classifyCandidatePromotion({
      strategy: createStrategy(),
      validation: createValidation({ observationCount: 5 }),
      harness: createHarness({ totalTradeCount: 2, successfulRuns: 1 }),
      significance: null,
      config,
    });

    expect(entry.decision).toBe("needs-more-data");
    expect(entry.recommendedNextAction).toBe("run-expanded-backtest");
  });

  it("promotes strong strategies to production watchlist", () => {
    const entry = classifyCandidatePromotion({
      strategy: createStrategy({ promotionStatus: "candidate" }),
      validation: createValidation({ robustnessScore: 90 }),
      harness: createHarness({ totalTradeCount: 25 }),
      significance: {
        statisticallySignificant: true,
        pValue: 0.01,
        insufficientSample: false,
      },
      config,
    });

    expect(entry.decision).toBe("production-watchlist");
    expect(entry.recommendedNextAction).toBe("promote-to-watchlist");
    expect(entry.supportingMetrics.statisticallySignificant).toBe(true);
  });

  it("classifies moderate evidence as candidate", () => {
    const entry = classifyCandidatePromotion({
      strategy: createStrategy({ promotionStatus: "experimental" }),
      validation: createValidation({ robustnessScore: 75 }),
      harness: createHarness({ totalTradeCount: 8 }),
      significance: null,
      config,
    });

    expect(entry.decision).toBe("candidate");
    expect(entry.recommendedNextAction).toBe("tune-parameters");
  });
});

describe("buildCandidatePromotionReport", () => {
  it("builds deterministic promotion summaries", () => {
    const report = buildCandidatePromotionReport({
      generatedAt: GENERATED_AT,
      outputPath: "data/research-results/candidate-promotions.json",
      htmlOutputPath: "data/reports/research-candidate-promotions.html",
      inputPaths: DEFAULT_CANDIDATE_PROMOTION_INPUT_PATHS,
      inputs: {
        validation: {
          generatedAt: GENERATED_AT,
          validations: [createValidation()],
        },
        synthesis: {
          generatedAt: GENERATED_AT,
          strategies: [createStrategy()],
        },
        harnessStrategies: [createHarness()],
        significanceByFamily: new Map(),
      },
    });

    expect(report.promotions).toHaveLength(1);
    expect(report.summary.totalStrategies).toBe(1);
    expect(serializeCandidatePromotionReport(report)).toContain("synth-atlas-vol-high-over");
    expect(serializeCandidatePromotionHtml(report)).toContain("Research Candidate Promotions");
  });
});

describe("loadCandidatePromotionInputs", () => {
  it("loads harness-results.json when present", () => {
    const inputs = loadCandidatePromotionInputs(
      {
        readFile: (path) => {
          if (path.endsWith("hypothesis-validation.json")) {
            return JSON.stringify({
              generatedAt: GENERATED_AT,
              validations: [createValidation()],
            });
          }
          if (path.endsWith("strategy-synthesis-candidates.json")) {
            return JSON.stringify({
              generatedAt: GENERATED_AT,
              strategies: [createStrategy()],
            });
          }
          if (path.endsWith("harness-results.json")) {
            return JSON.stringify({
              generatedAt: GENERATED_AT,
              strategies: [createHarness()],
            });
          }
          throw new Error(`unexpected read ${path}`);
        },
        fileExists: (path) =>
          path.endsWith("hypothesis-validation.json")
          || path.endsWith("strategy-synthesis-candidates.json")
          || path.endsWith("harness-results.json"),
        readdir: () => [],
        isDirectory: () => false,
      },
      DEFAULT_CANDIDATE_PROMOTION_INPUT_PATHS,
    );

    expect(inputs.harnessStrategies).toHaveLength(1);
    expect(inputs.harnessStrategies[0]?.totalTradeCount).toBe(24);
  });

  it("loads M8.15C harness-results shape with harnessRuns and tradeCount", () => {
    const inputs = loadCandidatePromotionInputs(
      {
        readFile: (path) => {
          if (path.endsWith("hypothesis-validation.json")) {
            return JSON.stringify({
              generatedAt: GENERATED_AT,
              validations: [createValidation()],
            });
          }
          if (path.endsWith("strategy-synthesis-candidates.json")) {
            return JSON.stringify({
              generatedAt: GENERATED_AT,
              strategies: [createStrategy()],
            });
          }
          if (path.endsWith("harness-results.json")) {
            return JSON.stringify({
              generatedAt: GENERATED_AT,
              strategies: [
                {
                  strategyId: "synth-atlas-vol-high-over",
                  hypothesisId: "atlas-vol-high-over",
                  strategyFamily: "calibration-fade",
                  harnessRuns: {
                    total: 10,
                    successful: 8,
                    failed: 2,
                    skipped: 0,
                  },
                  tradeCount: 24,
                  totalPnlCents: 1800,
                  warnings: [],
                },
              ],
            });
          }
          throw new Error(`unexpected read ${path}`);
        },
        fileExists: (path) =>
          path.endsWith("hypothesis-validation.json")
          || path.endsWith("strategy-synthesis-candidates.json")
          || path.endsWith("harness-results.json"),
        readdir: () => [],
        isDirectory: () => false,
      },
      DEFAULT_CANDIDATE_PROMOTION_INPUT_PATHS,
    );

    expect(inputs.harnessStrategies[0]?.successfulRuns).toBe(8);
    expect(inputs.harnessStrategies[0]?.totalTradeCount).toBe(24);
  });

  it("aggregates harness summary fallback when harness-results is missing", () => {
    const inputs = loadCandidatePromotionInputs(
      {
        readFile: (path) => {
          if (path.endsWith("hypothesis-validation.json")) {
            return JSON.stringify({
              generatedAt: GENERATED_AT,
              validations: [createValidation()],
            });
          }
          if (path.endsWith("strategy-synthesis-candidates.json")) {
            return JSON.stringify({
              generatedAt: GENERATED_AT,
              strategies: [createStrategy()],
            });
          }
          if (path.endsWith("strategy-harness-summary.json")) {
            return JSON.stringify({
              completedAt: GENERATED_AT,
              results: [
                {
                  synthesizedStrategyId: "synth-atlas-vol-high-over",
                  hypothesisId: "atlas-vol-high-over",
                  strategyFamily: "calibration-fade",
                  status: "success",
                  outputPath: "data/research-results/harness/synth-atlas-vol-high-over/KXBTC15M/M1/research-output.json",
                  errorMessage: null,
                },
              ],
            });
          }
          if (path.endsWith("research-output.json")) {
            return JSON.stringify({
              marketTicker: "M1",
              status: "completed",
              metrics: { tradeCount: 6, netPnlCents: 500, grossPnlCents: 500 },
            });
          }
          throw new Error(`unexpected read ${path}`);
        },
        fileExists: (path) =>
          path.endsWith("hypothesis-validation.json")
          || path.endsWith("strategy-synthesis-candidates.json")
          || path.endsWith("strategy-harness-summary.json")
          || path.endsWith("research-output.json"),
        readdir: () => [],
        isDirectory: () => false,
      },
      DEFAULT_CANDIDATE_PROMOTION_INPUT_PATHS,
    );

    expect(inputs.harnessStrategies[0]?.totalTradeCount).toBe(6);
  });
});

describe("classifyAllCandidatePromotions", () => {
  it("sorts promotions by strategy id", () => {
    const promotions = classifyAllCandidatePromotions({
      strategies: [
        createStrategy({ strategyId: "synth-b", hypothesisId: "b" }),
        createStrategy({ strategyId: "synth-a", hypothesisId: "a" }),
      ],
      validationByHypothesisId: new Map(),
      harnessByStrategyId: new Map(),
      significanceByFamily: new Map(),
      config: resolveCandidatePromotionConfig(),
    });

    expect(promotions.map((entry) => entry.strategyId)).toEqual(["synth-a", "synth-b"]);
  });
});
