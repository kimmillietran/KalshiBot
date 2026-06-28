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
