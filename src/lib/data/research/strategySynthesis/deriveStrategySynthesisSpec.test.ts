import { describe, expect, it } from "vitest";

import type { HypothesisCandidate } from "@/lib/data/research/hypothesisCandidates/hypothesisCandidateTypes";

import {
  buildStrategyId,
  derivePromotionStatus,
  deriveStrategyDirection,
  resolveStrategySynthesisConfig,
} from "./deriveStrategySynthesisSpec";

function createCandidate(
  overrides: Partial<HypothesisCandidate> = {},
): HypothesisCandidate {
  return {
    candidateId: "atlas-volatility-vol-high-over",
    sourceArtifact: "mispricing-atlas.json",
    hypothesis: "High volatility appears overconfident",
    rationale: "Calibration error 10%",
    marketCondition: "High volatility",
    suggestedStrategyFamily: "calibration-no-fade",
    requiredData: ["Kalshi implied probability"],
    proposedEntryCondition: "Enter NO when bucket matches",
    proposedExitSettlementAssumption: "Hold through settlement",
    expectedFailureMode: "May be noise",
    killCriterion: "Stop if calibration error falls below 2.5%",
    confidence: "medium",
    warnings: ["Exploratory only"],
    ...overrides,
  };
}

describe("deriveStrategyDirection", () => {
  it("maps calibration fade families to fade directions", () => {
    expect(
      deriveStrategyDirection(
        createCandidate({ suggestedStrategyFamily: "calibration-no-fade" }),
      ),
    ).toBe("fade-yes");

    expect(
      deriveStrategyDirection(
        createCandidate({ suggestedStrategyFamily: "calibration-yes-fade" }),
      ),
    ).toBe("fade-no");
  });

  it("defaults delayed-reaction hypotheses to buy-yes", () => {
    expect(
      deriveStrategyDirection(
        createCandidate({
          candidateId: "lead-lag-aggregate-lag-2",
          suggestedStrategyFamily: "delayed-reaction",
        }),
      ),
    ).toBe("buy-yes");
  });
});

describe("derivePromotionStatus", () => {
  const config = resolveStrategySynthesisConfig();

  it("rejects hypotheses that fail validation", () => {
    expect(
      derivePromotionStatus({
        candidate: createCandidate({ confidence: "high" }),
        validation: {
          hypothesisId: "atlas-volatility-vol-high-over",
          robustnessScore: 85,
          passes: false,
          reasons: ["Single-day dominated"],
          observationCount: 40,
        },
        config,
      }),
    ).toBe("rejected");
  });

  it("promotes high-confidence passing hypotheses with strong scores to candidate", () => {
    expect(
      derivePromotionStatus({
        candidate: createCandidate({ confidence: "high" }),
        validation: {
          hypothesisId: "atlas-volatility-vol-high-over",
          robustnessScore: 85,
          passes: true,
          reasons: [],
          observationCount: 120,
        },
        config,
      }),
    ).toBe("candidate");
  });

  it("marks passing but weaker hypotheses as experimental", () => {
    expect(
      derivePromotionStatus({
        candidate: createCandidate({ confidence: "medium" }),
        validation: {
          hypothesisId: "atlas-volatility-vol-high-over",
          robustnessScore: 75,
          passes: true,
          reasons: [],
          observationCount: 60,
        },
        config,
      }),
    ).toBe("experimental");
  });
});

describe("buildStrategyId", () => {
  it("prefixes and sanitizes hypothesis ids", () => {
    expect(buildStrategyId("atlas-volatility-vol-high-over")).toBe(
      "synth-atlas-volatility-vol-high-over",
    );
  });
});
