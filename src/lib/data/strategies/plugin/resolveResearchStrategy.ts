import type { BacktestStrategy } from "@/lib/data/backtesting/strategyTypes";

import { createBuiltInStrategyPluginRegistry } from "../baseline/baselineStrategyPack";
import type { StrategyPluginRegistry } from "./StrategyPluginRegistry";
import type { ResolveResearchStrategyInput } from "./strategyPluginTypes";

export type ResolveResearchStrategyOptions = ResolveResearchStrategyInput & {
  registry?: StrategyPluginRegistry;
};

/** Resolves a research/backtest strategy by id with optional validated config. */
export function resolveResearchStrategy(
  input: ResolveResearchStrategyOptions,
): BacktestStrategy {
  const registry = input.registry ?? createBuiltInStrategyPluginRegistry();
  return registry.resolveBacktestStrategy(input.strategyId, input.strategyConfig);
}

export { createBuiltInStrategyPluginRegistry } from "../baseline/baselineStrategyPack";
