import type { BacktestStrategy } from "@/lib/data/backtesting/strategyTypes";

import type {
  StrategyPlugin,
  StrategyPluginConfig,
  StrategyPluginDecisionTrace,
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

export type BacktestStrategyWithDecisionTrace = BacktestStrategy & {
  consumeLastDecisionTrace: () => StrategyPluginDecisionTrace | null;
};

export function isBacktestStrategyWithDecisionTrace(
  strategy: BacktestStrategy,
): strategy is BacktestStrategyWithDecisionTrace {
  return typeof (strategy as BacktestStrategyWithDecisionTrace).consumeLastDecisionTrace
    === "function";
}

/** Adapts a strategy plugin into the backtest engine's strategy contract. */
export function adaptStrategyPluginToBacktestStrategy<TConfig extends StrategyPluginConfig>(
  plugin: StrategyPlugin<TConfig>,
  config: TConfig,
): BacktestStrategyWithDecisionTrace {
  let state: StrategyPluginState = deepFreeze(plugin.createInitialState(config));
  let lastDecisionTrace: StrategyPluginDecisionTrace | null = null;

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
      lastDecisionTrace = deepFreeze(structuredClone(result.decisionTrace));
      return [...result.intents];
    },
    consumeLastDecisionTrace: () => lastDecisionTrace,
  };
}
