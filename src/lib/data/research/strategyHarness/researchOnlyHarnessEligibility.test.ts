import { describe, expect, it } from "vitest";

import {
  evaluateResearchOnlyHarnessEligibility,
  RESEARCH_ONLY_MIN_OBSERVATIONS,
  RESEARCH_ONLY_MIN_ROBUSTNESS_SCORE,
} from "./researchOnlyHarnessEligibility";
import type { RawSynthesizedStrategySpec } from "./normalizeSynthesizedStrategySpec";

function createRejectedStrategy(
  overrides: Partial<RawSynthesizedStrategySpec> = {},
): RawSynthesizedStrategySpec {
  return {
    strategyId: "synth-rejected",
    hypothesisId: "hypothesis-a",
    strategyFamily: "calibration-fade",
    direction: "fade-yes",
    entryConditions: { yesMidThresholdCents: 55 },
    exitAssumption: "Hold to settlement",
    requiredData: [],
    riskNotes: [],
    validationSummary: {
      robustnessScore: 58,
      passes: false,
      observationCount: 12,
    },
    promotionStatus: "rejected",
    ...overrides,
  };
}

describe("evaluateResearchOnlyHarnessEligibility", () => {
  it("rejects non-rejected strategies", () => {
    const result = evaluateResearchOnlyHarnessEligibility(
      createRejectedStrategy({ promotionStatus: "candidate" }),
      { failureAnalysisByHypothesisId: null },
    );

    expect(result.eligible).toBe(false);
  });

  it("requires robustness at or above the research-only floor", () => {
    const result = evaluateResearchOnlyHarnessEligibility(
      createRejectedStrategy({
        validationSummary: {
          robustnessScore: RESEARCH_ONLY_MIN_ROBUSTNESS_SCORE - 1,
          passes: false,
          observationCount: 12,
        },
      }),
      { failureAnalysisByHypothesisId: null },
    );

    expect(result.eligible).toBe(false);
    expect(result.reason).toContain(String(RESEARCH_ONLY_MIN_ROBUSTNESS_SCORE));
  });

  it("requires enough observations to simulate", () => {
    const result = evaluateResearchOnlyHarnessEligibility(
      createRejectedStrategy({
        validationSummary: {
          robustnessScore: 58,
          passes: false,
          observationCount: RESEARCH_ONLY_MIN_OBSERVATIONS - 1,
        },
      }),
      { failureAnalysisByHypothesisId: null },
    );

    expect(result.eligible).toBe(false);
    expect(result.reason).toContain(String(RESEARCH_ONLY_MIN_OBSERVATIONS));
  });

  it("requires near-promising priority when failure analysis is available", () => {
    const result = evaluateResearchOnlyHarnessEligibility(createRejectedStrategy(), {
      failureAnalysisByHypothesisId: new Map([
        ["hypothesis-a", { priorityCategory: "needs-more-data" }],
      ]),
    });

    expect(result.eligible).toBe(false);
    expect(result.reason).toContain("near-promising");
  });

  it("excludes blocked-by-coverage hypotheses", () => {
    const result = evaluateResearchOnlyHarnessEligibility(createRejectedStrategy(), {
      failureAnalysisByHypothesisId: new Map([
        ["hypothesis-a", { priorityCategory: "blocked-by-coverage" }],
      ]),
    });

    expect(result.eligible).toBe(false);
    expect(result.reason).toContain("blocked by coverage");
  });

  it("accepts near-promising rejected strategies", () => {
    const result = evaluateResearchOnlyHarnessEligibility(createRejectedStrategy(), {
      failureAnalysisByHypothesisId: new Map([
        ["hypothesis-a", { priorityCategory: "near-promising" }],
      ]),
    });

    expect(result.eligible).toBe(true);
  });
});
