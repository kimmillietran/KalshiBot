import {
  CALIBRATION_FADE_STRATEGY_ID,
} from "./plugins/calibrationFadeStrategyPlugin";
import {
  StrategyHarnessError,
  SUPPORTED_STRATEGY_HARNESS_FAMILIES,
  type SynthesizedStrategySpec,
  type SupportedStrategyHarnessFamily,
  type TranslatedHarnessStrategy,
} from "./strategyHarnessTypes";

function assertSupportedFamily(
  strategyFamily: string,
): asserts strategyFamily is SupportedStrategyHarnessFamily {
  if (
    !SUPPORTED_STRATEGY_HARNESS_FAMILIES.includes(
      strategyFamily as SupportedStrategyHarnessFamily,
    )
  ) {
    throw new StrategyHarnessError(
      `Unsupported strategy family "${strategyFamily}". Supported families: ${SUPPORTED_STRATEGY_HARNESS_FAMILIES.join(", ")}`,
    );
  }
}

/** Translates a synthesized strategy spec into harness plugin config. */
export function translateSynthesizedStrategySpec(
  spec: SynthesizedStrategySpec,
): TranslatedHarnessStrategy {
  assertSupportedFamily(spec.strategyFamily);

  return {
    pluginStrategyId: CALIBRATION_FADE_STRATEGY_ID,
    strategyConfig: {
      direction: spec.direction,
      yesMidThresholdCents: spec.entryConditions.yesMidThresholdCents,
      quantity: 1,
      hypothesisId: spec.hypothesisId,
    },
    synthesizedStrategyId: spec.strategyId,
    hypothesisId: spec.hypothesisId,
    strategyFamily: spec.strategyFamily,
  };
}
