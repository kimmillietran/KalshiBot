import { describe, expect, it } from "vitest";

import {
  HARNESS_DEFAULT_PROMOTION_STATUSES,
  HARNESS_NO_MATCH_WARNING,
  resolveHarnessStrategySpecs,
} from "./loadSynthesizedStrategySpecs";
import { resolveHarnessStrategySelection } from "./resolveHarnessStrategySelection";
import type { RawSynthesizedStrategySpec } from "./normalizeSynthesizedStrategySpec";

function createRawStrategy(
  overrides: Partial<RawSynthesizedStrategySpec> & Pick<RawSynthesizedStrategySpec, "strategyId">,
): RawSynthesizedStrategySpec {
  return {
    hypothesisId: "hypothesis-a",
    strategyFamily: "calibration-fade",
    direction: "fade-yes",
    entryConditions: { yesMidThresholdCents: 55 },
    exitAssumption: "Hold to settlement",
    requiredData: [],
    riskNotes: [],
    validationSummary: {
      robustnessScore: 50,
      passes: false,
      observationCount: 12,
    },
    promotionStatus: "experimental",
    ...overrides,
  };
}

describe("resolveHarnessStrategySpecs", () => {
  it("includes experimental and candidate strategies by default", () => {
    const specs = resolveHarnessStrategySpecs([
      createRawStrategy({
        strategyId: "synth-experimental",
        promotionStatus: "experimental",
      }),
      createRawStrategy({
        strategyId: "synth-candidate",
        promotionStatus: "candidate",
        validationSummary: {
          robustnessScore: 84,
          passes: true,
          observationCount: 12,
        },
      }),
    ]);

    expect(specs.map((spec) => spec.strategyId)).toEqual([
      "synth-candidate",
      "synth-experimental",
    ]);
    expect(HARNESS_DEFAULT_PROMOTION_STATUSES).toEqual(["experimental", "candidate"]);
  });

  it("excludes rejected strategies unless includeRejected is enabled", () => {
    const specs = resolveHarnessStrategySpecs(
      [
        createRawStrategy({
          strategyId: "synth-rejected",
          promotionStatus: "rejected",
        }),
      ],
      { includeRejected: false },
    );

    expect(specs).toEqual([]);
  });

  it("includes rejected strategies when includeRejected is enabled", () => {
    const specs = resolveHarnessStrategySpecs(
      [
        createRawStrategy({
          strategyId: "synth-rejected",
          promotionStatus: "rejected",
        }),
      ],
      { includeRejected: true },
    );

    expect(specs).toHaveLength(1);
    expect(specs[0]?.strategyId).toBe("synth-rejected");
  });

  it("includes research-worthy rejected strategies in research-only mode", () => {
    const result = resolveHarnessStrategySelection(
      [
        createRawStrategy({
          strategyId: "synth-near-promising",
          promotionStatus: "rejected",
          validationSummary: {
            robustnessScore: 58,
            passes: false,
            observationCount: 12,
          },
        }),
        createRawStrategy({
          strategyId: "synth-weak",
          promotionStatus: "rejected",
          validationSummary: {
            robustnessScore: 30,
            passes: false,
            observationCount: 12,
          },
        }),
      ],
      {
        researchOnlyBacktest: true,
        failureAnalysisByHypothesisId: new Map([
          ["hypothesis-a", { priorityCategory: "near-promising" }],
        ]),
      },
    );

    expect(result.specs.map((spec) => spec.strategyId)).toEqual([
      "synth-near-promising",
    ]);
    expect(result.includedRejectedStrategies).toBe(true);
    expect(result.skippedRejectedStrategyCount).toBe(1);
    expect(result.selection).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          strategyId: "synth-near-promising",
          decision: "included",
        }),
        expect.objectContaining({
          strategyId: "synth-weak",
          decision: "skipped",
        }),
      ]),
    );
  });

  it("skips unsupported families in research-only mode with a clear reason", () => {
    const result = resolveHarnessStrategySelection(
      [
        createRawStrategy({
          strategyId: "synth-unsupported",
          strategyFamily: "delayed-reaction",
          promotionStatus: "rejected",
          validationSummary: {
            robustnessScore: 58,
            passes: false,
            observationCount: 12,
          },
        }),
      ],
      {
        researchOnlyBacktest: true,
        failureAnalysisByHypothesisId: new Map([
          ["hypothesis-a", { priorityCategory: "near-promising" }],
        ]),
      },
    );

    expect(result.specs).toEqual([]);
    expect(result.selection[0]?.reason).toContain("Unsupported strategy family");
  });

  it("skips rejected strategies with missing entry fields in research-only mode", () => {
    const result = resolveHarnessStrategySelection(
      [
        createRawStrategy({
          strategyId: "synth-missing-entry",
          promotionStatus: "rejected",
          entryConditions: { marketCondition: "invalid" },
          validationSummary: {
            robustnessScore: 58,
            passes: false,
            observationCount: 12,
          },
        }),
      ],
      {
        researchOnlyBacktest: true,
        failureAnalysisByHypothesisId: new Map([
          ["hypothesis-a", { priorityCategory: "near-promising" }],
        ]),
      },
    );

    expect(result.specs).toEqual([]);
    expect(result.selection[0]?.decision).toBe("skipped");
    expect(result.selection[0]?.reason).toContain("yesMidThresholdCents");
  });

  it("does not normalize rejected strategies that would fail harness validation", () => {
    const specs = resolveHarnessStrategySpecs(
      [
        createRawStrategy({
          strategyId: "synth-rejected-unsupported",
          strategyFamily: "delayed-reaction",
          promotionStatus: "rejected",
        }),
      ],
      { includeRejected: false },
    );

    expect(specs).toEqual([]);
  });

  it("returns no specs when filters match zero eligible strategies", () => {
    const specs = resolveHarnessStrategySpecs(
      [
        createRawStrategy({
          strategyId: "synth-other-family",
          strategyFamily: "delayed-reaction",
          promotionStatus: "candidate",
        }),
      ],
      { strategyFamily: "calibration-fade" },
    );

    expect(specs).toEqual([]);
    expect(HARNESS_NO_MATCH_WARNING).toContain("empty strategy-harness-summary.json");
  });
});
