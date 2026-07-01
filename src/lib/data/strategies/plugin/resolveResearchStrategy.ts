import type { BacktestStrategy } from "@/lib/data/backtesting/strategyTypes";

import { StrategyPluginRegistry } from "./StrategyPluginRegistry";
import type { ResolveResearchStrategyInput } from "./strategyPluginTypes";

export type ResolveResearchStrategyOptions = ResolveResearchStrategyInput & {
  registry?: StrategyPluginRegistry;
};

/** Resolves a research/backtest strategy by id with optional validated config. */
export function resolveResearchStrategy(
  input: ResolveResearchStrategyOptions,
): BacktestStrategy {
  const registry = input.registry ?? StrategyPluginRegistry.createBuiltIn();
  return registry.resolveBacktestStrategy(input.strategyId, input.strategyConfig);
}

export function createBuiltInStrategyPluginRegistry(): StrategyPluginRegistry {
  return StrategyPluginRegistry.createBuiltIn();
}
