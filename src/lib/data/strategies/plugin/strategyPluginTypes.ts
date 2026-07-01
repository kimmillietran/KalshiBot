import type { z } from "zod";

import type {
  BacktestStrategyContext,
  TradeIntent,
} from "@/lib/data/backtesting/strategyTypes";
import type { ReplayStepResult } from "@/lib/data/replay/replaySessionTypes";

export type StrategyPluginConfig = Record<string, unknown>;

export type StrategyPluginState = Record<string, unknown>;

export type StrategyPluginDecisionInput<TConfig extends StrategyPluginConfig> = {
  step: ReplayStepResult;
  context: BacktestStrategyContext;
  config: TConfig;
  state: Readonly<StrategyPluginState>;
};

export type StrategyPluginDecisionResult = {
  intents: readonly TradeIntent[];
  nextState: StrategyPluginState;
};

export type StrategyPlugin<TConfig extends StrategyPluginConfig = StrategyPluginConfig> = {
  strategyId: string;
  description: string;
  configSchema: z.ZodType<TConfig>;
  createInitialState: (config: TConfig) => StrategyPluginState;
  decide: (input: StrategyPluginDecisionInput<TConfig>) => StrategyPluginDecisionResult;
};

export type ResolveResearchStrategyInput = {
  strategyId: string;
  strategyConfig?: unknown;
};

export type CreateStrategyPluginRegistryInput = {
  plugins?: readonly StrategyPlugin[];
};

export type StrategyPluginRegistrySnapshot = {
  strategyIds: readonly string[];
  descriptions: Readonly<Record<string, string>>;
};
