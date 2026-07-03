import { describe, expect, it } from "vitest";

import { createBuiltInStrategyPluginRegistry } from "@/lib/data/strategies";

import {
  createResearchStrategyHarnessRegistry,
  resolveHarnessStrategyFromSpec,
} from "./createResearchStrategyHarnessRegistry";
import { CALIBRATION_FADE_STRATEGY_ID } from "./plugins/calibrationFadeStrategyPlugin";
import { translateSynthesizedStrategySpec } from "./translateSynthesizedStrategySpec";
import type { SynthesizedStrategySpec } from "./strategyHarnessTypes";

function createSpec(
  overrides: Partial<SynthesizedStrategySpec> = {},
): SynthesizedStrategySpec {
  return {
    strategyId: "synth-atlas-vol-high-over",
    hypothesisId: "atlas-volatility-vol-high-over",
    strategyFamily: "calibration-fade",
    direction: "fade-yes",
    entryConditions: {
      yesMidThresholdCents: 55,
      minCalibrationError: 0.05,
    },
    exitAssumption: "Hold to settlement",
    requiredData: ["research-output.json"],
    riskNotes: ["Regime shift"],
    validationSummary: {
      robustnessScore: 84,
      passes: true,
      observationCount: 12,
    },
    promotionStatus: "candidate",
    ...overrides,
  };
}

describe("translateSynthesizedStrategySpec", () => {
  it("maps calibration-fade specs to calibration-fade plugin config", () => {
    expect(translateSynthesizedStrategySpec(createSpec())).toEqual({
      pluginStrategyId: CALIBRATION_FADE_STRATEGY_ID,
      strategyConfig: {
        direction: "fade-yes",
        yesMidThresholdCents: 55,
        quantity: 1,
        hypothesisId: "atlas-volatility-vol-high-over",
      },
      synthesizedStrategyId: "synth-atlas-vol-high-over",
      hypothesisId: "atlas-volatility-vol-high-over",
      strategyFamily: "calibration-fade",
    });
  });

  it("rejects unsupported strategy families", () => {
    expect(() =>
      translateSynthesizedStrategySpec(
        createSpec({ strategyFamily: "delayed-reaction" }),
      ),
    ).toThrow(/Unsupported strategy family/);
  });
});

describe("createResearchStrategyHarnessRegistry", () => {
  it("registers calibration-fade only in the harness registry", () => {
    const builtIn = createBuiltInStrategyPluginRegistry();
    const harness = createResearchStrategyHarnessRegistry();

    expect(builtIn.has(CALIBRATION_FADE_STRATEGY_ID)).toBe(false);
    expect(harness.has(CALIBRATION_FADE_STRATEGY_ID)).toBe(true);
    expect(resolveHarnessStrategyFromSpec(createSpec()).strategyId).toBe(
      CALIBRATION_FADE_STRATEGY_ID,
    );
  });
});
