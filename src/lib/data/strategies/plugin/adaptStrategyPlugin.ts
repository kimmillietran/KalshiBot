import type { BacktestStrategy } from "@/lib/data/backtesting/strategyTypes";

import type {
  StrategyPlugin,
  StrategyPluginConfig,
  StrategyPluginState,
} from "./strategyPluginTypes";

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object") {
    return value;
  }

  Object.freeze(value);

  if (Array.isArray(value)) {
    for (const item of value) {
      deepFreeze(item);
    }
  } else {
    for (const nested of Object.values(value)) {
      deepFreeze(nested);
    }
  }

  return value;
}

/** Adapts a strategy plugin into the backtest engine's strategy contract. */
export function adaptStrategyPluginToBacktestStrategy<TConfig extends StrategyPluginConfig>(
  plugin: StrategyPlugin<TConfig>,
  config: TConfig,
): BacktestStrategy {
  let state: StrategyPluginState = deepFreeze(plugin.createInitialState(config));

  return {
    strategyId: plugin.strategyId,
    decide: (step, context) => {
      const result = plugin.decide({
        step,
        context,
        config,
        state,
      });

      state = deepFreeze(result.nextState);
      return [...result.intents];
    },
  };
}
