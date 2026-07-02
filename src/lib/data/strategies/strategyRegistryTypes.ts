import type { BacktestStrategy } from "@/lib/data/backtesting/strategyTypes";

export const StrategyRegistryErrorCode = {
  UNKNOWN_STRATEGY_ID: "unknown-strategy-id",
  DUPLICATE_STRATEGY_ID: "duplicate-strategy-id",
  INVALID_STRATEGY_ID: "invalid-strategy-id",
  STRATEGY_ID_MISMATCH: "strategy-id-mismatch",
} as const;

export type StrategyRegistryErrorCode =
  (typeof StrategyRegistryErrorCode)[keyof typeof StrategyRegistryErrorCode];

export class StrategyRegistryError extends Error {
  readonly code: StrategyRegistryErrorCode;

  constructor(message: string, code: StrategyRegistryErrorCode) {
    super(message);
    this.name = "StrategyRegistryError";
    this.code = code;
  }
}

export const BUILTIN_STRATEGY_IDS = [
  "noop",
  "buy-first-ask",
  "buy-below-probability",
  "fair-value-diffusion",
  "simple-momentum",
  "simple-mean-reversion",
] as const;

export type BuiltinStrategyId = (typeof BUILTIN_STRATEGY_IDS)[number];

export type StrategyDefinition = {
  strategyId: string;
  strategy: BacktestStrategy;
  description: string;
};

export type StrategyRegistrySnapshot = {
  strategyIds: readonly string[];
  definitions: Readonly<Record<string, StrategyDefinition>>;
};

export type CreateStrategyRegistryInput = {
  definitions?: readonly StrategyDefinition[];
};
