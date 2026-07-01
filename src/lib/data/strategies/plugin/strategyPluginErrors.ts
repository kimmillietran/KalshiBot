export const StrategyPluginErrorCode = {
  UNKNOWN_STRATEGY_ID: "unknown-strategy-id",
  INVALID_STRATEGY_ID: "invalid-strategy-id",
  INVALID_STRATEGY_CONFIG: "invalid-strategy-config",
  DUPLICATE_STRATEGY_ID: "duplicate-strategy-id",
} as const;

export type StrategyPluginErrorCode =
  (typeof StrategyPluginErrorCode)[keyof typeof StrategyPluginErrorCode];

export class StrategyPluginError extends Error {
  readonly code: StrategyPluginErrorCode;
  readonly strategyId?: string;

  constructor(
    message: string,
    code: StrategyPluginErrorCode,
    strategyId?: string,
  ) {
    super(message);
    this.name = "StrategyPluginError";
    this.code = code;
    this.strategyId = strategyId;
  }
}
