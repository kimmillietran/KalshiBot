export const ReplayAdaptationErrorCode = {
  MISSING_KALSHI_CANDLES: "missing-kalshi-candles",
  MISSING_BTC_BARS: "missing-btc-bars",
  TICKER_MISMATCH: "ticker-mismatch",
  INVALID_TEMPORAL_ANCHOR: "invalid-temporal-anchor",
  INVALID_MARKET_CLOSE_TIME: "invalid-market-close-time",
} as const;

export type ReplayAdaptationErrorCode =
  (typeof ReplayAdaptationErrorCode)[keyof typeof ReplayAdaptationErrorCode];

const ERROR_MESSAGES: Record<ReplayAdaptationErrorCode, string> = {
  [ReplayAdaptationErrorCode.MISSING_KALSHI_CANDLES]:
    "Historical replay adaptation requires at least one Kalshi candle",
  [ReplayAdaptationErrorCode.MISSING_BTC_BARS]:
    "Historical replay adaptation requires at least one BTC bar",
  [ReplayAdaptationErrorCode.TICKER_MISMATCH]:
    "Historical trading snapshot ticker does not match market window ticker",
  [ReplayAdaptationErrorCode.INVALID_TEMPORAL_ANCHOR]:
    "Historical replay adaptation requires a valid temporal.observedAt anchor",
  [ReplayAdaptationErrorCode.INVALID_MARKET_CLOSE_TIME]:
    "Historical replay adaptation requires a valid market window closeTime",
};

export class ReplayAdaptationError extends Error {
  readonly code: ReplayAdaptationErrorCode;

  constructor(code: ReplayAdaptationErrorCode) {
    super(ERROR_MESSAGES[code]);
    this.name = "ReplayAdaptationError";
    this.code = code;
  }
}
