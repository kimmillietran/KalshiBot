import { ALL_BASELINE_STRATEGY_PLUGINS } from "@/lib/data/strategies/baseline/baselineStrategyPlugins";
import { StrategyPluginRegistry } from "@/lib/data/strategies/plugin/StrategyPluginRegistry";
import type { BacktestStrategy } from "@/lib/data/backtesting/strategyTypes";

import { calibrationFadeStrategyPlugin } from "./plugins/calibrationFadeStrategyPlugin";
import { translateSynthesizedStrategySpec } from "./translateSynthesizedStrategySpec";
import type { SynthesizedStrategySpec, TranslatedHarnessStrategy } from "./strategyHarnessTypes";

const HARNESS_ONLY_PLUGINS = [calibrationFadeStrategyPlugin] as const;

/** Registry used only when synthesized strategies are explicitly enabled. */
export function createResearchStrategyHarnessRegistry(): StrategyPluginRegistry {
  return StrategyPluginRegistry.create({
    plugins: [...ALL_BASELINE_STRATEGY_PLUGINS, ...HARNESS_ONLY_PLUGINS],
  });
}

export function resolveHarnessStrategyFromSpec(
  spec: SynthesizedStrategySpec,
  registry?: StrategyPluginRegistry,
): BacktestStrategy {
  const translated = translateSynthesizedStrategySpec(spec);
  return resolveTranslatedHarnessStrategy(translated, registry);
}

export function resolveTranslatedHarnessStrategy(
  translated: TranslatedHarnessStrategy,
  registry: StrategyPluginRegistry = createResearchStrategyHarnessRegistry(),
): BacktestStrategy {
  return registry.resolveBacktestStrategy(
    translated.pluginStrategyId,
    translated.strategyConfig,
  );
}

export function listHarnessStrategyIds(
  registry: StrategyPluginRegistry = createResearchStrategyHarnessRegistry(),
): readonly string[] {
  return registry.listStrategyIds();
}
