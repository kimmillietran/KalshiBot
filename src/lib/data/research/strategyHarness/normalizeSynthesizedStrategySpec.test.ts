import { describe, expect, it } from "vitest";

import {
  deriveYesMidThresholdCents,
  normalizeHarnessStrategyFamily,
  normalizeSynthesizedStrategySpec,
  parseStrategySynthesisCandidatesReport,
} from "./normalizeSynthesizedStrategySpec";
import { StrategyHarnessError } from "./strategyHarnessTypes";

describe("normalizeHarnessStrategyFamily", () => {
  it("maps calibration fade aliases to calibration-fade", () => {
    expect(normalizeHarnessStrategyFamily("calibration-no-fade")).toBe(
      "calibration-fade",
    );
    expect(normalizeHarnessStrategyFamily("calibration-yes-fade")).toBe(
      "calibration-fade",
    );
  });
});

describe("deriveYesMidThresholdCents", () => {
  it("uses explicit yesMidThresholdCents when present", () => {
    expect(
      deriveYesMidThresholdCents({
        direction: "fade-yes",
        entryConditions: { yesMidThresholdCents: 55 },
      }),
    ).toBe(55);
  });

  it("derives threshold from probability range for fade-yes", () => {
    expect(
      deriveYesMidThresholdCents({
        direction: "fade-yes",
        entryConditions: {
          marketCondition: "[0.7, 1.0] × high volatility regime",
        },
      }),
    ).toBe(70);
  });

  it("derives threshold from probability range for fade-no", () => {
    expect(
      deriveYesMidThresholdCents({
        direction: "fade-no",
        entryConditions: {
          marketCondition: "[0.0, 0.3] × low volatility regime",
        },
      }),
    ).toBe(30);
  });
});

describe("parseStrategySynthesisCandidatesReport", () => {
  it("accepts M8.15A synthesis output shape", () => {
    const report = parseStrategySynthesisCandidatesReport(
      "data/research-results/strategy-synthesis-candidates.json",
      {
        generatedAt: "2026-07-03T22:19:41.467Z",
        outputPath: "data/research-results/strategy-synthesis-candidates.json",
        inputPaths: {
          hypothesisCandidatesPath: "data/research-results/hypothesis-candidates.json",
          hypothesisValidationPath: "data/research-results/hypothesis-validation.json",
        },
        config: { candidatePromotionScoreThreshold: 80 },
        strategies: [
          {
            strategyId: "synth-atlas-probabilityregime-coarse-prob-2-coarse-regime-high-over",
            hypothesisId: "atlas-probabilityRegime-coarse-prob-2-coarse-regime-high-over",
            strategyFamily: "calibration-no-fade",
            direction: "fade-yes",
            entryConditions: {
              atlasGroupId: "probabilityRegime",
              bucketId: "coarse-prob-2-coarse-regime-high",
              calibrationDirection: "over",
              leadLagCandles: null,
              marketCondition: "[0.7, 1.0] × high volatility regime",
              minCalibrationError: 0.05,
              summary: "Enter NO when replay step maps to bucket",
            },
            exitAssumption: "Hold through settlement",
            requiredData: ["Kalshi implied probability"],
            riskNotes: ["Exploratory only"],
            validationSummary: {
              robustnessScore: 31,
              passes: false,
              observationCount: 150,
              reasons: ["Weak persistence"],
              summary: "Validation failed",
            },
            promotionStatus: "rejected",
          },
        ],
        summary: {
          synthesizedCount: 1,
          promotionCounts: { candidate: 0, experimental: 0, rejected: 1 },
        },
      },
    );

    expect(report.inputs.hypothesisCandidatesPath).toBe(
      "data/research-results/hypothesis-candidates.json",
    );
    expect(report.strategies[0]?.strategyFamily).toBe("calibration-fade");
    expect(report.strategies[0]?.entryConditions.yesMidThresholdCents).toBe(70);
  });

  it("throws when threshold cannot be derived", () => {
    expect(() =>
      normalizeSynthesizedStrategySpec({
        strategyId: "synth-test",
        hypothesisId: "test",
        strategyFamily: "calibration-no-fade",
        direction: "fade-yes",
        entryConditions: { summary: "No threshold" },
        exitAssumption: "Hold",
        requiredData: [],
        riskNotes: [],
        validationSummary: {
          robustnessScore: null,
          passes: false,
          observationCount: null,
        },
        promotionStatus: "rejected",
      }),
    ).toThrow(StrategyHarnessError);
  });
});
