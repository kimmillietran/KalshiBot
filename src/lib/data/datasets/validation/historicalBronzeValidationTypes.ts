export const HistoricalBronzeValidationErrorCode = {
  DUPLICATE_RECORD_ID: "duplicate-record-id",
  DUPLICATE_MARKET_WINDOW: "duplicate-market-window",
  DUPLICATE_SETTLEMENT: "duplicate-settlement",
  DUPLICATE_BTC_BAR: "duplicate-btc-bar",
  MISSING_TIMESTAMP: "missing-timestamp",
  INVALID_TIMESTAMP_ORDERING: "invalid-timestamp-ordering",
  MISSING_TICKER: "missing-ticker",
  MISSING_CONTENT_TYPE: "missing-content-type",
  UNSUPPORTED_CONTENT_TYPE: "unsupported-content-type",
  MALFORMED_PAYLOAD: "malformed-payload",
  INCOMPLETE_MARKET_GROUP: "incomplete-market-group",
  ORPHAN_SETTLEMENT: "orphan-settlement",
  ORPHAN_BTC_HISTORY: "orphan-btc-history",
  NEGATIVE_PRICE: "negative-price",
  INVALID_OHLC: "invalid-ohlc",
  INVALID_VOLUME: "invalid-volume",
  EMPTY_DATASET: "empty-dataset",
} as const;

export type HistoricalBronzeValidationErrorCode =
  (typeof HistoricalBronzeValidationErrorCode)[keyof typeof HistoricalBronzeValidationErrorCode];

export type HistoricalBronzeValidationSeverity = "error" | "warning";

export type HistoricalBronzeValidationIssue = {
  errorCode: HistoricalBronzeValidationErrorCode;
  severity: HistoricalBronzeValidationSeverity;
  message: string;
  recordId: string | null;
  ticker: string | null;
  eventTime: string | null;
  contentType: string | null;
};

export type HistoricalBronzeValidationStatistics = {
  totalRecords: number;
  marketCount: number;
  btcBarCount: number;
  settlementCount: number;
  duplicateCount: number;
};

export type HistoricalBronzeValidationResult = {
  valid: boolean;
  errors: readonly HistoricalBronzeValidationIssue[];
  warnings: readonly HistoricalBronzeValidationIssue[];
  statistics: HistoricalBronzeValidationStatistics;
};
