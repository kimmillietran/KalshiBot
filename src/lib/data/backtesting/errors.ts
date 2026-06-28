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
