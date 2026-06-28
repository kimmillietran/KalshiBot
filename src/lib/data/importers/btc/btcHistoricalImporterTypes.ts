import type { FetchProvenance } from "@/lib/data/provenance";

/** Supported BTC historical kline intervals for import. */
export const BtcHistoricalInterval = {
  ONE_MINUTE: "1m",
} as const;

export type BtcHistoricalInterval =
  (typeof BtcHistoricalInterval)[keyof typeof BtcHistoricalInterval];

export type BtcHistoricalHttpFetchKlinesInput = {
  symbol: string;
  interval: BtcHistoricalInterval;
  startTimeMs: number;
  endTimeMs: number;
};

export type BtcHistoricalHttpClient = {
  fetchKlines: (input: BtcHistoricalHttpFetchKlinesInput) => Promise<unknown>;
};

export type GetHistoricalBarsInput = {
  symbol: string;
  interval: BtcHistoricalInterval;
  startTime: string;
  endTime: string;
};

/** Normalized BTC historical bar compatible with the 6.15B bronze provider contract. */
export type BtcHistoricalImporterBar = {
  openTime: string;
  closeTime: string;
  openUsd: number;
  highUsd: number;
  lowUsd: number;
  closeUsd: number;
  volume: number;
  source: FetchProvenance["source"];
};

export type CreateBtcHistoricalImporterInput = {
  httpClient: BtcHistoricalHttpClient;
  source: FetchProvenance["source"];
};

export type BtcHistoricalImporter = {
  getHistoricalBars: (
    input: GetHistoricalBarsInput,
  ) => Promise<readonly BtcHistoricalImporterBar[]>;
};

export const BtcHistoricalImporterErrorCode = {
  INVALID_INPUT: "invalid-input",
  INVALID_SYMBOL: "invalid-symbol",
  INVALID_INTERVAL: "invalid-interval",
  INVALID_TIMESTAMP: "invalid-timestamp",
  INVALID_TIME_RANGE: "invalid-time-range",
  MALFORMED_RESPONSE: "malformed-response",
  NEGATIVE_PRICE: "negative-price",
  INVALID_OHLC: "invalid-ohlc",
  INVALID_VOLUME: "invalid-volume",
  UNSUPPORTED_SOURCE: "unsupported-source",
} as const;

export type BtcHistoricalImporterErrorCode =
  (typeof BtcHistoricalImporterErrorCode)[keyof typeof BtcHistoricalImporterErrorCode];

export class BtcHistoricalImporterError extends Error {
  readonly code: BtcHistoricalImporterErrorCode;

  constructor(message: string, code: BtcHistoricalImporterErrorCode) {
    super(message);
    this.name = "BtcHistoricalImporterError";
    this.code = code;
  }
}

export const DEFAULT_BINANCE_SPOT_KLINES_BASE = "https://api.binance.com";
