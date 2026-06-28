import type { CollectionTime, EventTime, ObservedAt } from "@/lib/data/timestamps";

export const HistoricalBronzeImportKalshiSource = {
  KALSHI_REST: "kalshi-rest",
  KALSHI_CANDLES: "kalshi-candles",
} as const;

export type HistoricalBronzeImportKalshiSource =
  (typeof HistoricalBronzeImportKalshiSource)[keyof typeof HistoricalBronzeImportKalshiSource];

export const HistoricalBronzeImportBtcProvider = {
  BINANCE_SPOT: "binance-spot",
  COINBASE_SPOT: "coinbase-spot",
} as const;

export type HistoricalBronzeImportBtcProvider =
  (typeof HistoricalBronzeImportBtcProvider)[keyof typeof HistoricalBronzeImportBtcProvider];

export const HistoricalBronzeImportBtcInterval = {
  ONE_MINUTE: "1m",
} as const;

export type HistoricalBronzeImportBtcInterval =
  (typeof HistoricalBronzeImportBtcInterval)[keyof typeof HistoricalBronzeImportBtcInterval];

export const HistoricalBronzeImportOutputFormat = {
  JSON: "json",
  NDJSON: "ndjson",
} as const;

export type HistoricalBronzeImportOutputFormat =
  (typeof HistoricalBronzeImportOutputFormat)[keyof typeof HistoricalBronzeImportOutputFormat];

export type HistoricalBronzeImportKalshiConfig = {
  marketSource: HistoricalBronzeImportKalshiSource;
  candleSource: HistoricalBronzeImportKalshiSource;
  settlementSource: HistoricalBronzeImportKalshiSource;
};

export type HistoricalBronzeImportBtcConfig = {
  provider: HistoricalBronzeImportBtcProvider;
  symbol: string;
  interval: HistoricalBronzeImportBtcInterval;
};

export type HistoricalBronzeImportOutputConfig = {
  format: HistoricalBronzeImportOutputFormat;
  includeValidationReport: boolean;
  includeFixture: boolean;
};

export type HistoricalBronzeImportConfigMetadata = Readonly<Record<string, unknown>>;

export type HistoricalBronzeImportConfig = {
  jobId: string;
  marketTicker: string;
  startTime: EventTime;
  endTime: EventTime;
  collectionTime: CollectionTime;
  observedAt: ObservedAt;
  kalshi: HistoricalBronzeImportKalshiConfig;
  btc: HistoricalBronzeImportBtcConfig;
  output: HistoricalBronzeImportOutputConfig;
  metadata: HistoricalBronzeImportConfigMetadata;
};

export type BuildHistoricalBronzeImportConfigInput = {
  jobId: string;
  marketTicker: string;
  startTime: string;
  endTime: string;
  collectionTime: string;
  observedAt: string;
  kalshi: HistoricalBronzeImportKalshiConfig;
  btc: HistoricalBronzeImportBtcConfig;
  output: HistoricalBronzeImportOutputConfig;
  metadata?: HistoricalBronzeImportConfigMetadata;
};

export const HistoricalBronzeImportConfigErrorCode = {
  INVALID_INPUT: "invalid-input",
  MISSING_JOB_ID: "missing-job-id",
  MISSING_MARKET_TICKER: "missing-market-ticker",
  INVALID_TIMESTAMP: "invalid-timestamp",
  INVALID_TIME_RANGE: "invalid-time-range",
  INVALID_KALSHI_SOURCE: "invalid-kalshi-source",
  INVALID_BTC_PROVIDER: "invalid-btc-provider",
  INVALID_BTC_SYMBOL: "invalid-btc-symbol",
  INVALID_BTC_INTERVAL: "invalid-btc-interval",
  INVALID_OUTPUT_FORMAT: "invalid-output-format",
} as const;

export type HistoricalBronzeImportConfigErrorCode =
  (typeof HistoricalBronzeImportConfigErrorCode)[keyof typeof HistoricalBronzeImportConfigErrorCode];

export class HistoricalBronzeImportConfigError extends Error {
  readonly code: HistoricalBronzeImportConfigErrorCode;

  constructor(message: string, code: HistoricalBronzeImportConfigErrorCode) {
    super(message);
    this.name = "HistoricalBronzeImportConfigError";
    this.code = code;
  }
}
