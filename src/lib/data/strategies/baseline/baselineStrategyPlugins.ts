import { buyFirstAskStrategyPlugin } from "../plugin/builtins/buyFirstAskStrategyPlugin";
import { buyBelowProbabilityStrategyPlugin } from "../plugin/builtins/buyBelowProbabilityStrategyPlugin";
import { fairValueDiffusionStrategyPlugin } from "../plugin/builtins/fairValueDiffusionStrategyPlugin";
import { noopStrategyPlugin } from "../plugin/builtins/noopStrategyPlugin";
import { simpleMeanReversionStrategyPlugin } from "../plugin/builtins/simpleMeanReversionStrategyPlugin";
import { simpleMomentumStrategyPlugin } from "../plugin/builtins/simpleMomentumStrategyPlugin";
import type { StrategyPlugin } from "../plugin/strategyPluginTypes";

export const BASELINE_STRATEGY_IDS = [
  "noop",
  "buy-first-ask",
  "buy-below-probability",
  "fair-value-diffusion",
  "simple-momentum",
  "simple-mean-reversion",
] as const;

export type BaselineStrategyId = (typeof BASELINE_STRATEGY_IDS)[number];

export const ALL_BASELINE_STRATEGY_PLUGINS: readonly StrategyPlugin[] = [
  noopStrategyPlugin,
  buyFirstAskStrategyPlugin,
  buyBelowProbabilityStrategyPlugin,
  fairValueDiffusionStrategyPlugin,
  simpleMomentumStrategyPlugin,
  simpleMeanReversionStrategyPlugin,
];

const BASELINE_PLUGIN_BY_ID = new Map(
  ALL_BASELINE_STRATEGY_PLUGINS.map((plugin) => [plugin.strategyId, plugin]),
);

export function getBaselineStrategyPlugin(
  strategyId: BaselineStrategyId,
): StrategyPlugin {
  const plugin = BASELINE_PLUGIN_BY_ID.get(strategyId);
  if (!plugin) {
    throw new Error(`Unknown baseline strategy id: ${strategyId}`);
  }
  return plugin;
}

export {
  noopStrategyPlugin,
  buyFirstAskStrategyPlugin,
  buyBelowProbabilityStrategyPlugin,
  fairValueDiffusionStrategyPlugin,
  simpleMomentumStrategyPlugin,
  simpleMeanReversionStrategyPlugin,
};
