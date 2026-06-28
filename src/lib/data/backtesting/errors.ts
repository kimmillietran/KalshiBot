export const BacktestStrategyRunnerErrorCode = {
  INVALID_FILL_CONFIG: "invalid-fill-config",
  UNSUPPORTED_PARTIAL_FILLS: "unsupported-partial-fills",
  UNSUPPORTED_PRICE_SOURCE: "unsupported-price-source",
} as const;

export type BacktestStrategyRunnerErrorCode =
  (typeof BacktestStrategyRunnerErrorCode)[keyof typeof BacktestStrategyRunnerErrorCode];

export class BacktestStrategyRunnerError extends Error {
  readonly code: BacktestStrategyRunnerErrorCode;

  constructor(message: string, code: BacktestStrategyRunnerErrorCode) {
    super(message);
    this.name = "BacktestStrategyRunnerError";
    this.code = code;
  }
}

export const BacktestIntentRejectionCode = {
  INVALID_TICKER: "invalid-ticker",
  INVALID_QUANTITY: "invalid-quantity",
  INVALID_LIMIT_PRICE: "invalid-limit-price",
  TICKER_NOT_IN_STEP: "ticker-not-in-step",
  MISSING_PRICING: "missing-pricing",
  MISSING_EXECUTION_PRICE: "missing-execution-price",
  LIMIT_PRICE_NOT_MET: "limit-price-not-met",
  INSUFFICIENT_CASH: "insufficient-cash",
  INSUFFICIENT_POSITION: "insufficient-position",
} as const;

export type BacktestIntentRejectionCode =
  (typeof BacktestIntentRejectionCode)[keyof typeof BacktestIntentRejectionCode];

export const BacktestLedgerErrorCode = {
  INVALID_INITIAL_CASH: "invalid-initial-cash",
  INVALID_TICKER: "invalid-ticker",
  INVALID_QUANTITY: "invalid-quantity",
  INVALID_PRICE: "invalid-price",
  INVALID_FEE: "invalid-fee",
  INVALID_TIMESTAMP: "invalid-timestamp",
  INVALID_SOURCE_STEP_INDEX: "invalid-source-step-index",
  INSUFFICIENT_CASH: "insufficient-cash",
  INSUFFICIENT_POSITION: "insufficient-position",
  MISSING_MARK_PRICE: "missing-mark-price",
} as const;

export type BacktestLedgerErrorCode =
  (typeof BacktestLedgerErrorCode)[keyof typeof BacktestLedgerErrorCode];

export class BacktestLedgerError extends Error {
  readonly code: BacktestLedgerErrorCode;

  constructor(message: string, code: BacktestLedgerErrorCode) {
    super(message);
    this.name = "BacktestLedgerError";
    this.code = code;
  }
}

export const BacktestMetricsErrorCode = {
  EMPTY_EQUITY_CURVE: "empty-equity-curve",
  NEGATIVE_EQUITY: "negative-equity",
  ZERO_START_EQUITY: "zero-start-equity",
  INVALID_PERIODS_PER_YEAR: "invalid-periods-per-year",
  INVALID_RISK_FREE_RATE: "invalid-risk-free-rate",
} as const;

export type BacktestMetricsErrorCode =
  (typeof BacktestMetricsErrorCode)[keyof typeof BacktestMetricsErrorCode];

const ERROR_MESSAGES: Record<BacktestMetricsErrorCode, string> = {
  [BacktestMetricsErrorCode.EMPTY_EQUITY_CURVE]:
    "Backtest metrics require at least one equity curve point",
  [BacktestMetricsErrorCode.NEGATIVE_EQUITY]:
    "Equity values must be non-negative",
  [BacktestMetricsErrorCode.ZERO_START_EQUITY]:
    "Starting equity must be greater than zero",
  [BacktestMetricsErrorCode.INVALID_PERIODS_PER_YEAR]:
    "periodsPerYear must be a positive finite number",
  [BacktestMetricsErrorCode.INVALID_RISK_FREE_RATE]:
    "riskFreeRatePerPeriod must be a finite number",
};

export class BacktestMetricsError extends Error {
  readonly code: BacktestMetricsErrorCode;

  constructor(code: BacktestMetricsErrorCode) {
    super(ERROR_MESSAGES[code]);
    this.name = "BacktestMetricsError";
    this.code = code;
  }
}

export const MonteCarloErrorCode = {
  EMPTY_TRADE_LIST: "empty-trade-list",
  ZERO_SIMULATIONS: "zero-simulations",
  INVALID_STARTING_EQUITY: "invalid-starting-equity",
  INVALID_SEED: "invalid-seed",
  INVALID_TRADE_VALUE: "invalid-trade-value",
  UNSUPPORTED_RESAMPLE_MODE: "unsupported-resample-mode",
} as const;

export type MonteCarloErrorCode =
  (typeof MonteCarloErrorCode)[keyof typeof MonteCarloErrorCode];

const MONTE_CARLO_ERROR_MESSAGES: Record<MonteCarloErrorCode, string> = {
  [MonteCarloErrorCode.EMPTY_TRADE_LIST]:
    "Monte Carlo analysis requires at least one closed trade",
  [MonteCarloErrorCode.ZERO_SIMULATIONS]:
    "simulationCount must be greater than zero",
  [MonteCarloErrorCode.INVALID_STARTING_EQUITY]:
    "startingEquityCents must be a positive finite number",
  [MonteCarloErrorCode.INVALID_SEED]:
    "seed must be a finite number",
  [MonteCarloErrorCode.INVALID_TRADE_VALUE]:
    "Closed trade values must be finite numbers",
  [MonteCarloErrorCode.UNSUPPORTED_RESAMPLE_MODE]:
    "resampleMode must be bootstrap or permutation",
};

export class MonteCarloAnalysisError extends Error {
  readonly code: MonteCarloErrorCode;

  constructor(code: MonteCarloErrorCode) {
    super(MONTE_CARLO_ERROR_MESSAGES[code]);
    this.name = "MonteCarloAnalysisError";
    this.code = code;
  }
}
