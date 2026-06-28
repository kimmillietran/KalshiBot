export const SnapshotAssemblyErrorCode = {
  MISSING_MARKET_WINDOW: "missing-market-window",
  MISSING_KALSHI_CANDLES: "missing-kalshi-candles",
  MISSING_BTC_BARS: "missing-btc-bars",
} as const;

export type SnapshotAssemblyErrorCode =
  (typeof SnapshotAssemblyErrorCode)[keyof typeof SnapshotAssemblyErrorCode];

const ERROR_MESSAGES: Record<SnapshotAssemblyErrorCode, string> = {
  [SnapshotAssemblyErrorCode.MISSING_MARKET_WINDOW]:
    "Historical trading snapshot requires a market window",
  [SnapshotAssemblyErrorCode.MISSING_KALSHI_CANDLES]:
    "Historical trading snapshot requires at least one Kalshi candle",
  [SnapshotAssemblyErrorCode.MISSING_BTC_BARS]:
    "Historical trading snapshot requires at least one BTC bar",
};

export class HistoricalSnapshotAssemblyError extends Error {
  readonly code: SnapshotAssemblyErrorCode;

  constructor(code: SnapshotAssemblyErrorCode) {
    super(ERROR_MESSAGES[code]);
    this.name = "HistoricalSnapshotAssemblyError";
    this.code = code;
  }
}
