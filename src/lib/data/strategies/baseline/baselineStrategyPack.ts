import { StrategyPluginRegistry } from "../plugin/StrategyPluginRegistry";
import type { StrategyPluginRegistry as StrategyPluginRegistryType } from "../plugin/StrategyPluginRegistry";

import {
  ALL_BASELINE_STRATEGY_PLUGINS,
  BASELINE_STRATEGY_IDS,
  getBaselineStrategyPlugin,
  type BaselineStrategyId,
} from "./baselineStrategyPlugins";

export {
  ALL_BASELINE_STRATEGY_PLUGINS,
  BASELINE_STRATEGY_IDS,
  getBaselineStrategyPlugin,
  noopStrategyPlugin,
  buyFirstAskStrategyPlugin,
  buyBelowProbabilityStrategyPlugin,
  fairValueDiffusionStrategyPlugin,
  simpleMomentumStrategyPlugin,
  simpleMeanReversionStrategyPlugin,
} from "./baselineStrategyPlugins";
export type { BaselineStrategyId } from "./baselineStrategyPlugins";

/** Creates a plugin registry containing only the requested baseline strategies. */
export function createBaselineStrategyPluginRegistry(
  includeIds: readonly BaselineStrategyId[] = BASELINE_STRATEGY_IDS,
): StrategyPluginRegistryType {
  const plugins = includeIds.map((strategyId) => getBaselineStrategyPlugin(strategyId));
  return StrategyPluginRegistry.create({ plugins });
}

/** Default built-in registry containing the full baseline strategy pack. */
export function createBuiltInStrategyPluginRegistry(): StrategyPluginRegistryType {
  return StrategyPluginRegistry.create({
    plugins: [...ALL_BASELINE_STRATEGY_PLUGINS],
  });
}
