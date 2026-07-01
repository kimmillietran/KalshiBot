import type { BuildHistoricalBronzeImportConfigInput } from "@/lib/data/importJobs/config";

export const BatchImportConfigErrorCode = {
  MISSING_DISCOVERY_FILE: "missing-discovery-file",
  INVALID_DISCOVERY_SCHEMA: "invalid-discovery-schema",
  INVALID_DISCOVERY_RESULT: "invalid-discovery-result",
  MISSING_IMPORT_WINDOW_TIMESTAMPS: "missing-import-window-timestamps",
  DUPLICATE_OUTPUT_PATH: "duplicate-output-path",
  INVALID_MARKET_TICKER_PATH: "invalid-market-ticker-path",
} as const;

export type BatchImportConfigErrorCode =
  (typeof BatchImportConfigErrorCode)[keyof typeof BatchImportConfigErrorCode];

export class BatchImportConfigError extends Error {
  readonly code: BatchImportConfigErrorCode;
  readonly marketTicker?: string;

  constructor(
    message: string,
    code: BatchImportConfigErrorCode,
    marketTicker?: string,
  ) {
    super(message);
    this.name = "BatchImportConfigError";
    this.code = code;
    this.marketTicker = marketTicker;
  }
}

export type ImportWindowTimestamps = {
  startTime: string;
  endTime: string;
  collectionTime: string;
  observedAt: string;
};

export type BatchImportConfigFile = {
  marketTicker: string;
  outputPath: string;
  config: BuildHistoricalBronzeImportConfigInput;
  serialized: string;
};

export type BatchImportConfigGenerationResult = {
  seriesTicker: string;
  outputRoot: string;
  files: readonly BatchImportConfigFile[];
};

export type BuildBatchImportConfigsInput = {
  discovery: import("@/lib/data/discovery").MarketDiscoveryResult;
  outputRoot?: string;
};
