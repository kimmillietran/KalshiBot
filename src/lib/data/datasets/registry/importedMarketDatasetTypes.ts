import type {
  HistoricalBronzeImportBtcConfig,
  HistoricalBronzeImportConfig,
  HistoricalBronzeImportKalshiConfig,
} from "@/lib/data/importJobs/config";
import type { HistoricalBronzeImportJobCoreResult } from "@/lib/data/importJobs/historicalBronzeImportJobTypes";

export const DatasetRegistryErrorCode = {
  DUPLICATE_MARKET_DIRECTORY: "duplicate-market-directory",
  MISSING_IMPORT_RESULT: "missing-import-result",
  INVALID_METADATA: "invalid-metadata",
  MANIFEST_INCONSISTENCY: "manifest-inconsistency",
  BROKEN_DIRECTORY_STRUCTURE: "broken-directory-structure",
} as const;

export type DatasetRegistryErrorCode =
  (typeof DatasetRegistryErrorCode)[keyof typeof DatasetRegistryErrorCode];

export class DatasetRegistryError extends Error {
  readonly code: DatasetRegistryErrorCode;
  readonly marketTicker?: string;

  constructor(
    message: string,
    code: DatasetRegistryErrorCode,
    marketTicker?: string,
  ) {
    super(message);
    this.name = "DatasetRegistryError";
    this.code = code;
    this.marketTicker = marketTicker;
  }
}

export type ImportedMarketSourceProviders = {
  kalshi: HistoricalBronzeImportKalshiConfig;
  btc: HistoricalBronzeImportBtcConfig;
};

export type ImportedMarketMetadataProvenance = {
  jobId: string;
  importTimestamp: string;
  sources: readonly string[];
};

export type ImportedMarketValidationStatus = {
  valid: boolean;
  errorCount: number;
  warningCount: number;
};

export type ImportedMarketMetadata = {
  marketTicker: string;
  eventTicker: string;
  seriesTicker: string;
  importTimestamp: string;
  sourceProviders: ImportedMarketSourceProviders;
  bronzeRecordCount: number;
  btcBarCount: number;
  kalshiCandleCount: number;
  settlementPresent: boolean;
  validationStatus: ImportedMarketValidationStatus;
  provenance: ImportedMarketMetadataProvenance;
  importDurationMs: number;
};

export const ImportedMarketDatasetStatus = {
  COMPLETE: "complete",
  MISSING_IMPORT_RESULT: "missing-import-result",
  MISSING_CONFIG: "missing-config",
  MISSING_METADATA: "missing-metadata",
  INVALID: "invalid",
} as const;

export type ImportedMarketDatasetStatus =
  (typeof ImportedMarketDatasetStatus)[keyof typeof ImportedMarketDatasetStatus];

export type ImportedMarketDatasetPaths = {
  directoryPath: string;
  configPath: string;
  importResultPath: string;
  metadataPath: string;
};

export type DatasetManifestMarketSummary = {
  bronzeRecordCount: number;
  btcBarCount: number;
  kalshiCandleCount: number;
  settlementPresent: boolean;
  validationValid: boolean;
};

export type DatasetManifestEntry = {
  seriesTicker: string;
  marketTicker: string;
  directoryPath: string;
  configPath: string;
  importResultPath: string;
  metadataPath: string;
  importStatus: ImportedMarketDatasetStatus;
  summary: DatasetManifestMarketSummary;
};

export type DatasetManifestSummary = {
  marketCount: number;
  completeMarketCount: number;
  totalBronzeRecords: number;
  totalBtcBars: number;
  totalKalshiCandles: number;
  settlementMarketCount: number;
};

export type DatasetManifest = {
  generatedAt: string;
  inputDir: string;
  markets: readonly DatasetManifestEntry[];
  summary: DatasetManifestSummary;
};

export type BuildImportedMarketMetadataInput = {
  config: HistoricalBronzeImportConfig;
  importResult: HistoricalBronzeImportJobCoreResult;
};

export type EnsureImportedMarketDirectoryInput = {
  importsRoot: string;
  seriesTicker: string;
  marketTicker: string;
};

export type BuildDatasetManifestInput = {
  inputDir: string;
  generatedAt: string;
  entries: readonly ScannedImportedMarketDataset[];
};

export type ScannedImportedMarketDataset = {
  seriesTicker: string;
  marketTicker: string;
  paths: ImportedMarketDatasetPaths;
  files: {
    config?: string;
    importResult?: string;
    metadata?: string;
  };
};

export type DatasetRegistryIo = {
  readdir: (path: string) => readonly string[];
  readFile: (path: string) => string;
  fileExists: (path: string) => boolean;
  isDirectory: (path: string) => boolean;
};
