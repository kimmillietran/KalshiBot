import { describe, expect, it } from "vitest";

import type { StrategySynthesisCandidate } from "@/lib/data/research/strategySynthesis/strategySynthesisTypes";

import {
  deriveHarnessPromotionRecommendation,
  resolveHarnessResultsConfig,
} from "./deriveHarnessPromotionRecommendation";

function createStrategy(
  overrides: Partial<StrategySynthesisCandidate> = {},
): StrategySynthesisCandidate {
  return {
    strategyId: "synth-atlas-volatility-vol-high-over",
    hypothesisId: "atlas-volatility-vol-high-over",
    strategyFamily: "calibration-no-fade",
    direction: "fade-yes",
    entryConditions: {
      summary: "Enter NO in high vol bucket",
      marketCondition: "High volatility",
      atlasGroupId: "volatility",
      bucketId: "vol-high",
      calibrationDirection: "over",
      minCalibrationError: 0.05,
      leadLagCandles: null,
    },
    exitAssumption: "Hold through settlement",
    requiredData: ["Kalshi implied probability"],
    riskNotes: ["Exploratory"],
    validationSummary: {
      robustnessScore: 82,
      passes: true,
      observationCount: 60,
      reasons: [],
      summary: "Passed validation",
    },
    promotionStatus: "candidate",
    ...overrides,
  };
}

describe("deriveHarnessPromotionRecommendation", () => {
  const config = resolveHarnessResultsConfig();

  it("rejects strategies that were not run", () => {
    expect(
      deriveHarnessPromotionRecommendation({
        strategy: createStrategy(),
        validation: null,
        runStatus: "not-run",
        completedMarkets: 0,
        winRatePct: 0,
        totalPnlCents: 0,
        config,
      }),
    ).toBe("reject");
  });

  it("promotes strong harness performers to candidate", () => {
    expect(
      deriveHarnessPromotionRecommendation({
        strategy: createStrategy(),
        validation: {
          hypothesisId: "atlas-volatility-vol-high-over",
          robustnessScore: 85,
          passes: true,
          reasons: [],
        },
        runStatus: "completed",
        completedMarkets: 5,
        winRatePct: 55,
        totalPnlCents: 500,
        config,
      }),
    ).toBe("candidate");
  });

  it("requests more data for partial runs", () => {
    expect(
      deriveHarnessPromotionRecommendation({
        strategy: createStrategy({ promotionStatus: "experimental" }),
        validation: {
          hypothesisId: "atlas-volatility-vol-high-over",
          robustnessScore: 75,
          passes: true,
          reasons: [],
        },
        runStatus: "partial",
        completedMarkets: 2,
        winRatePct: 50,
        totalPnlCents: 100,
        config,
      }),
    ).toBe("needs-more-data");
  });
});
