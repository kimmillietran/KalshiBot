import { describe, expect, it } from "vitest";

import { buildStrategySynthesisReport } from "./buildStrategySynthesisReport";
import type { HypothesisCandidatesReport } from "@/lib/data/research/hypothesisCandidates/hypothesisCandidateTypes";
import type { ParsedHypothesisValidationReport } from "./strategySynthesisTypes";

const GENERATED_AT = "2026-07-03T12:00:00.000Z";
const OUTPUT_PATH = "data/research-results/strategy-synthesis-candidates.json";

function createCandidatesReport(
  candidates: HypothesisCandidatesReport["candidates"],
): HypothesisCandidatesReport {
  return {
    generatedAt: GENERATED_AT,
    outputPath: "data/research-results/hypothesis-candidates.json",
    config: {
      minSampleSize: 30,
      minCalibrationError: 0.05,
      minLeadLagCorrelation: 0.2,
    },
    inputs: {
      mispricingAtlasPath: "data/research-results/mispricing-atlas.json",
      leadLagAnalysisPath: "data/research-results/lead-lag-analysis.json",
      statisticalSignificancePath: "data/research-results/statistical-significance.json",
      regimeTagsPath: "data/research-results/regime-tags.json",
      strategyLeaderboardPath: "data/leaderboards/strategy-leaderboard.json",
      mispricingAtlasPresent: true,
      leadLagAnalysisPresent: false,
      statisticalSignificancePresent: false,
      regimeTagsPresent: false,
      strategyLeaderboardPresent: false,
    },
    candidates,
    summary: {
      candidateCount: candidates.length,
      noCandidateReasons: [],
      atlasCoverageDiagnostics: null,
    },
  };
}

function createValidationReport(
  validations: ParsedHypothesisValidationReport["validations"],
): ParsedHypothesisValidationReport {
  return {
    generatedAt: GENERATED_AT,
    outputPath: "data/research-results/hypothesis-validation.json",
    validations,
  };
}

describe("buildStrategySynthesisReport", () => {
  it("synthesizes parameterized strategies for each hypothesis candidate", () => {
    const report = buildStrategySynthesisReport({
      generatedAt: GENERATED_AT,
      outputPath: OUTPUT_PATH,
      inputPaths: {
        hypothesisCandidatesPath: "data/research-results/hypothesis-candidates.json",
        hypothesisValidationPath: "data/research-results/hypothesis-validation.json",
      },
      inputs: {
        candidatesReport: createCandidatesReport([
          {
            candidateId: "atlas-probabilityOnly-coarse-prob-3-over",
            sourceArtifact: "mispricing-atlas.json",
            hypothesis: "Coarse probability bucket appears overconfident",
            rationale: "Calibration error 8%",
            marketCondition: "[0.6, 0.8)",
            suggestedStrategyFamily: "calibration-no-fade",
            requiredData: ["Kalshi implied probability", "Settlement outcome"],
            proposedEntryCondition:
              "Enter NO when replay step maps to [0.6, 0.8) and implied exceeds realized by 5%.",
            proposedExitSettlementAssumption: "Hold through settlement",
            expectedFailureMode: "Calibration gap may be noise",
            killCriterion: "Stop if calibration error falls below 2.5%",
            confidence: "high",
            warnings: [],
          },
        ]),
        validationReport: createValidationReport([
          {
            hypothesisId: "atlas-probabilityOnly-coarse-prob-3-over",
            robustnessScore: 82,
            passes: true,
            reasons: [],
            observationCount: 90,
          },
        ]),
      },
    });

    expect(report.strategies).toHaveLength(1);
    const strategy = report.strategies[0]!;
    expect(strategy.strategyId).toBe("synth-atlas-probabilityonly-coarse-prob-3-over");
    expect(strategy.hypothesisId).toBe("atlas-probabilityOnly-coarse-prob-3-over");
    expect(strategy.direction).toBe("fade-yes");
    expect(strategy.promotionStatus).toBe("candidate");
    expect(strategy.entryConditions.atlasGroupId).toBe("probabilityOnly");
    expect(strategy.entryConditions.bucketId).toBe("coarse-prob-3");
    expect(strategy.validationSummary.passes).toBe(true);
    expect(report.summary.promotionCounts.candidate).toBe(1);
  });

  it("marks strategies rejected when validation is missing", () => {
    const report = buildStrategySynthesisReport({
      generatedAt: GENERATED_AT,
      outputPath: OUTPUT_PATH,
      inputPaths: {
        hypothesisCandidatesPath: "data/research-results/hypothesis-candidates.json",
        hypothesisValidationPath: "data/research-results/hypothesis-validation.json",
      },
      inputs: {
        candidatesReport: createCandidatesReport([
          {
            candidateId: "lead-lag-aggregate-lag-1",
            sourceArtifact: "lead-lag-analysis.json",
            hypothesis: "BTC leads Kalshi by 1 candle",
            rationale: "Correlation 0.3",
            marketCondition: "BTC return leads Kalshi probability by 1 candle(s)",
            suggestedStrategyFamily: "delayed-reaction",
            requiredData: ["BTC spot", "Kalshi implied probability"],
            proposedEntryCondition: "Enter after lag window",
            proposedExitSettlementAssumption: "Exit after catch-up",
            expectedFailureMode: "Replay artifact",
            killCriterion: "Discard if correlation drops",
            confidence: "low",
            warnings: ["Unsupported validation"],
          },
        ]),
        validationReport: createValidationReport([]),
      },
    });

    expect(report.strategies[0]?.promotionStatus).toBe("rejected");
    expect(report.summary.promotionCounts.rejected).toBe(1);
  });
});
