import { describe, expect, it } from "vitest";

import type { HypothesisCandidate } from "@/lib/data/research/hypothesisCandidates/hypothesisCandidateTypes";

import { deriveHypothesisTradeRule } from "./deriveHypothesisTradeRule";

function createCandidate(
  candidateId: string,
  overrides: Partial<HypothesisCandidate> = {},
): HypothesisCandidate {
  return {
    candidateId,
    sourceArtifact: "mispricing-atlas.json",
    hypothesis: "Test hypothesis",
    rationale: "Test rationale",
    marketCondition: "Test condition",
    suggestedStrategyFamily: "calibration-no-fade",
    requiredData: ["research-output.json"],
    proposedEntryCondition: "Enter when edge exceeds threshold",
    proposedExitSettlementAssumption: "Hold to settlement",
    expectedFailureMode: "Regime shift",
    killCriterion: "Edge disappears",
    confidence: "medium",
    warnings: [],
    bucketMetadata: {
      groupId: "probabilityOnly",
      bucketId: "coarse-prob-3",
      bucketLabel: "[0.7, 0.9)",
      observations: 100,
      uniqueTradingDays: 10,
      calibrationError: 0.08,
      calibrationDirection: "over",
    },
    ...overrides,
  };
}

describe("deriveHypothesisTradeRule", () => {
  it("maps overconfident hypothesis to buy NO", () => {
    const rule = deriveHypothesisTradeRule(
      createCandidate("atlas-probabilityOnly-coarse-prob-3-over"),
    );

    expect(rule).toEqual({
      side: "no",
      calibrationDirection: "over",
      rationale:
        "Overconfident bucket: fade YES by buying NO at the available ask (cross-spread).",
    });
  });

  it("maps underconfident hypothesis to buy YES", () => {
    const rule = deriveHypothesisTradeRule(
      createCandidate("atlas-probabilityOnly-coarse-prob-3-under", {
        suggestedStrategyFamily: "calibration-yes-fade",
        bucketMetadata: {
          groupId: "probabilityOnly",
          bucketId: "coarse-prob-3",
          bucketLabel: "[0.7, 0.9)",
          observations: 100,
          uniqueTradingDays: 10,
          calibrationError: -0.08,
          calibrationDirection: "under",
        },
      }),
    );

    expect(rule?.side).toBe("yes");
    expect(rule?.calibrationDirection).toBe("under");
  });

  it("returns null for unsupported lead-lag hypotheses", () => {
    expect(
      deriveHypothesisTradeRule(createCandidate("lead-lag-aggregate-lag-2")),
    ).toBeNull();
  });
});
