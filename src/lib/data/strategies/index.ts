export {
  ALL_BASELINE_STRATEGY_PLUGINS,
  BASELINE_STRATEGY_IDS,
  createBaselineStrategyPluginRegistry,
  createBuiltInStrategyPluginRegistry,
  getBaselineStrategyPlugin,
} from "./baseline/baselineStrategyPack";
export type { BaselineStrategyId } from "./baseline/baselineStrategyPlugins";

export {
  StrategyRegistry,
  noopStrategyDefinition,
  buyFirstAskStrategyDefinition,
  BUILTIN_STRATEGY_IDS,
  StrategyRegistryError,
  StrategyRegistryErrorCode,
} from "./StrategyRegistry";

export type {
  BuiltinStrategyId,
  CreateStrategyRegistryInput,
  StrategyDefinition,
  StrategyRegistrySnapshot,
} from "./strategyRegistryTypes";

export {
  StrategyPluginRegistry,
  adaptStrategyPluginToBacktestStrategy,
  resolveResearchStrategy,
  noopStrategyPlugin,
  buyFirstAskStrategyPlugin,
  StrategyPluginError,
  StrategyPluginErrorCode,
} from "./plugin";
export type {
  StrategyPlugin,
  StrategyPluginConfig,
  StrategyPluginState,
  StrategyPluginDecisionInput,
  StrategyPluginDecisionResult,
  ResolveResearchStrategyInput,
  CreateStrategyPluginRegistryInput,
  StrategyPluginRegistrySnapshot,
} from "./plugin";
