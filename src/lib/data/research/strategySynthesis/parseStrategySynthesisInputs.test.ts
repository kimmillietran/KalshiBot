import { describe, expect, it } from "vitest";

import {
  parseHypothesisCandidatesReport,
  parseHypothesisValidationReport,
} from "./parseStrategySynthesisInputs";
import { StrategySynthesisError } from "./strategySynthesisTypes";

describe("parseStrategySynthesisInputs", () => {
  it("parses hypothesis candidates and validation reports", () => {
    const candidates = parseHypothesisCandidatesReport(
      JSON.stringify({
        generatedAt: "2026-07-03T12:00:00.000Z",
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
        candidates: [
          {
            candidateId: "atlas-volatility-vol-high-over",
            sourceArtifact: "mispricing-atlas.json",
            hypothesis: "High volatility appears overconfident",
            rationale: "Calibration error 10%",
            marketCondition: "High volatility",
            suggestedStrategyFamily: "calibration-no-fade",
            requiredData: ["Kalshi implied probability"],
            proposedEntryCondition: "Enter NO",
            proposedExitSettlementAssumption: "Hold through settlement",
            expectedFailureMode: "Noise",
            killCriterion: "Stop if error falls",
            confidence: "medium",
            warnings: [],
          },
        ],
        summary: {
          candidateCount: 1,
          noCandidateReasons: [],
        },
      }),
    );

    const validation = parseHypothesisValidationReport(
      JSON.stringify({
        generatedAt: "2026-07-03T12:00:00.000Z",
        outputPath: "data/research-results/hypothesis-validation.json",
        validations: [
          {
            hypothesisId: "atlas-volatility-vol-high-over",
            robustnessScore: 78,
            passes: true,
            reasons: [],
            observationCount: 50,
          },
        ],
      }),
    );

    expect(candidates.candidates).toHaveLength(1);
    expect(validation.validations[0]?.hypothesisId).toBe(
      "atlas-volatility-vol-high-over",
    );
  });

  it("throws on invalid validation JSON", () => {
    expect(() => parseHypothesisValidationReport("{")).toThrow(StrategySynthesisError);
  });
});
