import { describe, expect, it } from "vitest";

import {
  HARNESS_DEFAULT_PROMOTION_STATUSES,
  HARNESS_NO_MATCH_WARNING,
  resolveHarnessStrategySpecs,
} from "./loadSynthesizedStrategySpecs";
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
      observationCount: 4,
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
