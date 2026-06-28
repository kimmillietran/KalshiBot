import type { FetchProvenance } from "@/lib/data/provenance";
import type { RawHistoricalRecord } from "@/lib/data/types";

export type BtcHistoricalBar = {
  openTime: string;
  closeTime: string;
  openUsd: number;
  highUsd: number;
  lowUsd: number;
  closeUsd: number;
  volume: number;
  source: FetchProvenance["source"];
};

export type BtcHistoricalBronzeProviderImportInput = {
  marketTicker: string;
  startTime: string;
  endTime: string;
  collectionTime: string;
  observedAt: string;
};

export type MapBtcHistoricalBarToBronzeRecordInput = {
  bar: BtcHistoricalBar;
  marketTicker: string;
  collectionTime: string;
  observedAt: string;
};

export type BtcHistoricalBronzeProvider = {
  importBtcKlineRecords: (
    input: BtcHistoricalBronzeProviderImportInput,
  ) => readonly RawHistoricalRecord[];
};

export type CreateInMemoryBtcHistoricalBronzeProviderInput = {
  bars: readonly BtcHistoricalBar[];
};

export const BtcHistoricalBronzeProviderErrorCode = {
  INVALID_INPUT: "invalid-input",
  MISSING_TICKER: "missing-ticker",
  MISSING_SOURCE: "missing-source",
  INVALID_TIMESTAMP: "invalid-timestamp",
  INVALID_TIME_RANGE: "invalid-time-range",
  NEGATIVE_PRICE: "negative-price",
  INVALID_OHLC: "invalid-ohlc",
  INVALID_VOLUME: "invalid-volume",
} as const;

export type BtcHistoricalBronzeProviderErrorCode =
  (typeof BtcHistoricalBronzeProviderErrorCode)[keyof typeof BtcHistoricalBronzeProviderErrorCode];

export class BtcHistoricalBronzeProviderError extends Error {
  readonly code: BtcHistoricalBronzeProviderErrorCode;

  constructor(message: string, code: BtcHistoricalBronzeProviderErrorCode) {
    super(message);
    this.name = "BtcHistoricalBronzeProviderError";
    this.code = code;
  }
}
