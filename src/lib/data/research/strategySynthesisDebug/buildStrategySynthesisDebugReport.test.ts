import { describe, expect, it } from "vitest";

import {
  buildStrategySynthesisDebugReport,
} from "./buildStrategySynthesisDebugReport";
import { serializeStrategySynthesisDebugHtml } from "./serializeStrategySynthesisDebugHtml";
import { diagnoseHarnessStrategyEligibility } from "./diagnoseHarnessStrategyEligibility";
import type { RawSynthesizedStrategySpec } from "@/lib/data/research/strategyHarness/normalizeSynthesizedStrategySpec";

const GENERATED_AT = "2026-07-07T03:00:00.000Z";

function baseCandidate(id: string, family = "calibration-no-fade") {
  return {
    candidateId: id,
    sourceArtifact: "mispricing-atlas.json",
    hypothesis: `Hypothesis for ${id}`,
    rationale: "Test rationale",
    marketCondition: "[0.7, 1.0] × high volatility regime",
    suggestedStrategyFamily: family,
    requiredData: ["Kalshi implied probability"],
    proposedEntryCondition: "Enter NO when threshold exceeded.",
    proposedExitSettlementAssumption: "Hold through settlement.",
    expectedFailureMode: "May be noise.",
    killCriterion: "Stop after 30 observations.",
    confidence: "medium" as const,
    warnings: [],
  };
}

function baseValidation(id: string, passes: boolean, score: number) {
  return {
    hypothesisId: id,
    robustnessScore: score,
    passes,
    reasons: passes ? [] : ["Month persistence weak across excluded folds."],
    observationCount: 100,
  };
}

function baseRawStrategy(
  hypothesisId: string,
  overrides?: Partial<RawSynthesizedStrategySpec>,
): RawSynthesizedStrategySpec {
  return {
    strategyId: `synth-${hypothesisId}`,
    hypothesisId,
    strategyFamily: "calibration-no-fade",
    direction: "fade-yes",
    entryConditions: {
      summary: "Enter NO when threshold exceeded.",
      marketCondition: "[0.7, 1.0] × high volatility regime",
      atlasGroupId: "probabilityRegime",
      bucketId: "bucket",
      calibrationDirection: "over",
      minCalibrationError: 0.05,
      leadLagCandles: null,
    },
    exitAssumption: "Hold through settlement.",
    requiredData: ["Kalshi implied probability"],
    riskNotes: ["Kill criterion noted."],
    validationSummary: {
      robustnessScore: 34,
      passes: false,
      observationCount: 100,
      reasons: ["Month persistence weak across excluded folds."],
      summary: "Robustness score 34/100; validation failed.",
    },
    promotionStatus: "rejected",
    ...overrides,
  };
}

function createIo(files: Record<string, string>) {
  return {
    readFile: (path: string) => files[path] ?? (() => { throw new Error(`missing ${path}`); })(),
    fileExists: (path: string) => path in files,
  };
}

function writeFixtureFiles(input: {
  candidates?: unknown;
  validation?: unknown;
  synthesis?: unknown;
  harnessSummary?: unknown;
}) {
  const files: Record<string, string> = {
    "data/research-results/hypothesis-candidates.json": JSON.stringify(
      input.candidates ?? {
        generatedAt: GENERATED_AT,
        outputPath: "data/research-results/hypothesis-candidates.json",
        config: { minCalibrationError: 0.05 },
        inputs: {},
        candidates: [],
        summary: { candidateCount: 0, noCandidateReasons: ["Atlas produced no qualifying buckets."] },
      },
    ),
  };

  if (input.validation) {
    files["data/research-results/hypothesis-validation.json"] = JSON.stringify(input.validation);
  }

  if (input.synthesis) {
    files["data/research-results/strategy-synthesis-candidates.json"] = JSON.stringify(input.synthesis);
  }

  if (input.harnessSummary) {
    files["data/research-results/harness/strategy-harness-summary.json"] = JSON.stringify(
      input.harnessSummary,
    );
  }

  return files;
}

describe("buildStrategySynthesisDebugReport", () => {
  it("diagnoses zero harness candidates when all synthesis rows fail validation", () => {
    const hypothesisId = "atlas-probabilityRegime-coarse-prob-2-coarse-regime-high-over";
    const files = writeFixtureFiles({
      candidates: {
        generatedAt: GENERATED_AT,
        outputPath: "data/research-results/hypothesis-candidates.json",
        config: { minCalibrationError: 0.05 },
        inputs: {},
        candidates: [baseCandidate(hypothesisId)],
        summary: { candidateCount: 1, noCandidateReasons: [] },
      },
      validation: {
        generatedAt: GENERATED_AT,
        outputPath: "data/research-results/hypothesis-validation.json",
        validations: [baseValidation(hypothesisId, false, 34)],
      },
      synthesis: {
        generatedAt: GENERATED_AT,
        outputPath: "data/research-results/strategy-synthesis-candidates.json",
        inputPaths: {},
        config: { candidatePromotionScoreThreshold: 80 },
        summary: {
          totalCandidates: 1,
          synthesizedCount: 1,
          promotionCounts: { experimental: 0, candidate: 0, rejected: 1 },
          skipReasons: [],
        },
        strategies: [baseRawStrategy(hypothesisId)],
      },
      harnessSummary: {
        synthesisPath: "data/research-results/strategy-synthesis-candidates.json",
        outputDir: "data/research-results/harness",
        summaryPath: "data/research-results/harness/strategy-harness-summary.json",
        evaluatedStrategies: 0,
        totalRuns: 0,
        successfulRuns: 0,
        failedRuns: 0,
        skippedRuns: 0,
        warnings: [
          "No synthesized strategies matched harness filters; wrote empty strategy-harness-summary.json",
        ],
        results: [],
      },
    });

    const report = buildStrategySynthesisDebugReport({
      generatedAt: GENERATED_AT,
      outputPath: "data/research-results/strategy-synthesis-debug.json",
      htmlOutputPath: "data/reports/strategy-synthesis-debug.html",
      inputPaths: {
        hypothesisCandidatesPath: "data/research-results/hypothesis-candidates.json",
        hypothesisValidationPath: "data/research-results/hypothesis-validation.json",
        strategySynthesisPath: "data/research-results/strategy-synthesis-candidates.json",
        harnessSummaryPath: "data/research-results/harness/strategy-harness-summary.json",
        harnessResultsPath: "data/research-results/harness-results.json",
      },
      io: createIo(files),
    });

    expect(report.summary.funnel).toEqual({
      hypothesisCandidates: 1,
      synthesisCandidates: 1,
      harnessEligible: 0,
      harnessEvaluated: 0,
      evaluatedStrategies: 0,
    });
    expect(report.summary.diagnosis).toBe("expected-validation-failure");
    expect(report.traces[0]?.rejectionCategories).toContain("promotion-rejected");
    expect(report.traces[0]?.rejectionCategories).toContain("harness-filter-excluded");
    expect(report.traces[0]?.rejectionReasons.some((reason) => reason.includes("validation failed"))).toBe(true);
  });

  it("reports rejected strategy reasons for unsupported family bridge gap", () => {
    const hypothesisId = "atlas-leadlag-delayed-reaction";
    const files = writeFixtureFiles({
      candidates: {
        generatedAt: GENERATED_AT,
        outputPath: "data/research-results/hypothesis-candidates.json",
        config: { minCalibrationError: 0.05 },
        inputs: {},
        candidates: [baseCandidate(hypothesisId, "delayed-reaction")],
        summary: { candidateCount: 1, noCandidateReasons: [] },
      },
      validation: {
        generatedAt: GENERATED_AT,
        outputPath: "data/research-results/hypothesis-validation.json",
        validations: [baseValidation(hypothesisId, true, 82)],
      },
      synthesis: {
        generatedAt: GENERATED_AT,
        outputPath: "data/research-results/strategy-synthesis-candidates.json",
        inputPaths: {},
        config: { candidatePromotionScoreThreshold: 80 },
        summary: {
          totalCandidates: 1,
          synthesizedCount: 1,
          promotionCounts: { experimental: 1, candidate: 0, rejected: 0 },
          skipReasons: [],
        },
        strategies: [
          baseRawStrategy(hypothesisId, {
            strategyFamily: "delayed-reaction",
            direction: "buy-yes",
            promotionStatus: "experimental",
            validationSummary: {
              robustnessScore: 82,
              passes: true,
              observationCount: 100,
              reasons: [],
              summary: "Robustness score 82/100; validation passed.",
            },
          }),
        ],
      },
    });

    const report = buildStrategySynthesisDebugReport({
      generatedAt: GENERATED_AT,
      outputPath: "data/research-results/strategy-synthesis-debug.json",
      htmlOutputPath: "data/reports/strategy-synthesis-debug.html",
      inputPaths: {
        hypothesisCandidatesPath: "data/research-results/hypothesis-candidates.json",
        hypothesisValidationPath: "data/research-results/hypothesis-validation.json",
        strategySynthesisPath: "data/research-results/strategy-synthesis-candidates.json",
        harnessSummaryPath: "data/research-results/harness/strategy-harness-summary.json",
        harnessResultsPath: "data/research-results/harness-results.json",
      },
      io: createIo(files),
    });

    expect(report.summary.diagnosis).toBe("unsupported-family-bridge-gap");
    expect(report.traces[0]?.rejectionCategories).toContain("unsupported-strategy-family");
    expect(report.summary.funnel.harnessEligible).toBe(0);
  });

  it("handles malformed synthesis candidate documents", () => {
    const files = writeFixtureFiles({
      candidates: {
        generatedAt: GENERATED_AT,
        outputPath: "data/research-results/hypothesis-candidates.json",
        config: { minCalibrationError: 0.05 },
        inputs: {},
        candidates: [baseCandidate("hyp-a")],
        summary: { candidateCount: 1, noCandidateReasons: [] },
      },
      validation: {
        generatedAt: GENERATED_AT,
        outputPath: "data/research-results/hypothesis-validation.json",
        validations: [baseValidation("hyp-a", false, 40)],
      },
    });
    files["data/research-results/strategy-synthesis-candidates.json"] = "{ not-json";

    const report = buildStrategySynthesisDebugReport({
      generatedAt: GENERATED_AT,
      outputPath: "data/research-results/strategy-synthesis-debug.json",
      htmlOutputPath: "data/reports/strategy-synthesis-debug.html",
      inputPaths: {
        hypothesisCandidatesPath: "data/research-results/hypothesis-candidates.json",
        hypothesisValidationPath: "data/research-results/hypothesis-validation.json",
        strategySynthesisPath: "data/research-results/strategy-synthesis-candidates.json",
        harnessSummaryPath: "data/research-results/harness/strategy-harness-summary.json",
        harnessResultsPath: "data/research-results/harness-results.json",
      },
      io: createIo(files),
    });

    expect(report.summary.funnel.synthesisCandidates).toBe(0);
    expect(report.summary.diagnosis).toBe("schema-mismatch");
    expect(report.investigatorNotes.some((note) => note.includes("parse error"))).toBe(true);
  });

  it("renders HTML with funnel counts and produces deterministic output", () => {
    const hypothesisId = "hyp-deterministic";
    const files = writeFixtureFiles({
      candidates: {
        generatedAt: GENERATED_AT,
        outputPath: "data/research-results/hypothesis-candidates.json",
        config: { minCalibrationError: 0.05 },
        inputs: {},
        candidates: [baseCandidate(hypothesisId)],
        summary: { candidateCount: 1, noCandidateReasons: [] },
      },
      validation: {
        generatedAt: GENERATED_AT,
        outputPath: "data/research-results/hypothesis-validation.json",
        validations: [baseValidation(hypothesisId, false, 49)],
      },
      synthesis: {
        generatedAt: GENERATED_AT,
        outputPath: "data/research-results/strategy-synthesis-candidates.json",
        inputPaths: {},
        config: { candidatePromotionScoreThreshold: 80 },
        summary: {
          totalCandidates: 1,
          synthesizedCount: 1,
          promotionCounts: { experimental: 0, candidate: 0, rejected: 1 },
          skipReasons: [],
        },
        strategies: [baseRawStrategy(hypothesisId, { validationSummary: {
          robustnessScore: 49,
          passes: false,
          observationCount: 100,
          reasons: ["Score below threshold."],
          summary: "Robustness score 49/100; validation failed.",
        } })],
      },
    });

    const config = {
      generatedAt: GENERATED_AT,
      outputPath: "data/research-results/strategy-synthesis-debug.json",
      htmlOutputPath: "data/reports/strategy-synthesis-debug.html",
      inputPaths: {
        hypothesisCandidatesPath: "data/research-results/hypothesis-candidates.json",
        hypothesisValidationPath: "data/research-results/hypothesis-validation.json",
        strategySynthesisPath: "data/research-results/strategy-synthesis-candidates.json",
        harnessSummaryPath: "data/research-results/harness/strategy-harness-summary.json",
        harnessResultsPath: "data/research-results/harness-results.json",
      },
      io: createIo(files),
    };

    const first = buildStrategySynthesisDebugReport(config);
    const second = buildStrategySynthesisDebugReport(config);
    const html = serializeStrategySynthesisDebugHtml(first);

    expect(first).toEqual(second);
    expect(html).toContain("Pipeline funnel");
    expect(html).toContain("Harness eligible");
    expect(html).toContain(hypothesisId);
    expect(first.summary.nearPromisingCount).toBe(1);
  });
});

describe("diagnoseHarnessStrategyEligibility", () => {
  it("flags missing entry threshold and unsupported family", () => {
    const diagnosis = diagnoseHarnessStrategyEligibility(
      baseRawStrategy("hyp-a", {
        strategyFamily: "delayed-reaction",
        entryConditions: {
          summary: "No threshold",
          marketCondition: "unparseable condition",
        },
      }),
    );

    expect(diagnosis.eligible).toBe(false);
    expect(diagnosis.rejectionCategories).toContain("unsupported-strategy-family");
    expect(diagnosis.rejectionCategories).toContain("missing-entry-threshold");
  });
});
