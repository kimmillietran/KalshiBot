import type { FetchProvenance } from "@/lib/data/provenance";
import type { HistoricalTradingSnapshot } from "@/lib/data/snapshots/types";
import type { DatasetVersion } from "@/lib/data/versioning";

/** Bronze content type for Binance spot klines consumed by the dataset pipeline. */
export const DATASET_BRONZE_CONTENT_TYPE = {
  BTC_KLINE: "binance.historical.kline",
} as const;

export type DatasetBronzeContentType =
  (typeof DATASET_BRONZE_CONTENT_TYPE)[keyof typeof DATASET_BRONZE_CONTENT_TYPE];

export const HistoricalDatasetBuildErrorCode = {
  EMPTY_BRONZE_RECORDS: "empty-bronze-records",
  DUPLICATE_RECORD_ID: "duplicate-record-id",
  DUPLICATE_MARKET_WINDOW: "duplicate-market-window",
  DUPLICATE_SETTLEMENT: "duplicate-settlement",
  INCOMPLETE_SNAPSHOT_GROUP: "incomplete-snapshot-group",
  UNSUPPORTED_BRONZE_CONTENT_TYPE: "unsupported-bronze-content-type",
} as const;

export type HistoricalDatasetBuildErrorCode =
  (typeof HistoricalDatasetBuildErrorCode)[keyof typeof HistoricalDatasetBuildErrorCode];

const ERROR_MESSAGES: Record<HistoricalDatasetBuildErrorCode, string> = {
  [HistoricalDatasetBuildErrorCode.EMPTY_BRONZE_RECORDS]:
    "Historical dataset build requires at least one bronze record",
  [HistoricalDatasetBuildErrorCode.DUPLICATE_RECORD_ID]:
    "Duplicate bronze recordId in dataset input",
  [HistoricalDatasetBuildErrorCode.DUPLICATE_MARKET_WINDOW]:
    "Multiple market window bronze records for the same ticker",
  [HistoricalDatasetBuildErrorCode.DUPLICATE_SETTLEMENT]:
    "Multiple settlement bronze records for the same ticker",
  [HistoricalDatasetBuildErrorCode.INCOMPLETE_SNAPSHOT_GROUP]:
    "Bronze records for a market ticker do not form a complete snapshot group",
  [HistoricalDatasetBuildErrorCode.UNSUPPORTED_BRONZE_CONTENT_TYPE]:
    "Bronze record contentType is not supported by the historical dataset pipeline",
};

export class HistoricalDatasetBuildError extends Error {
  readonly code: HistoricalDatasetBuildErrorCode;
  readonly ticker?: string;
  readonly recordId?: string;

  constructor(
    code: HistoricalDatasetBuildErrorCode,
    options?: { ticker?: string; recordId?: string; cause?: unknown },
  ) {
    super(ERROR_MESSAGES[code], options?.cause ? { cause: options.cause } : undefined);
    this.name = "HistoricalDatasetBuildError";
    this.code = code;
    this.ticker = options?.ticker;
    this.recordId = options?.recordId;
  }
}

/** Metadata describing a built historical dataset. */
export type HistoricalDatasetMetadata = {
  datasetId: string;
  contractVersion: DatasetVersion;
  snapshotCount: number;
  marketTickers: readonly string[];
};

/** Aggregated provenance trace for bronze inputs used to build the dataset. */
export type HistoricalDatasetProvenanceSummary = {
  bronzeRecordCount: number;
  bronzeRecordIds: readonly string[];
  provenanceByBronzeRecordId: Readonly<Record<string, FetchProvenance>>;
  rejectedMarketTickers: readonly string[];
};

/** Immutable replay-ready collection of historical trading snapshots. */
export type HistoricalDataset = {
  snapshots: readonly HistoricalTradingSnapshot[];
  metadata: HistoricalDatasetMetadata;
  provenance: HistoricalDatasetProvenanceSummary;
};
