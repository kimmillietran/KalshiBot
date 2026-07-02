import type { BatchImportMarketResult } from "./batchImportTypes";

export const DEFAULT_BATCH_IMPORT_FAILURE_ANALYSIS_INPUT_PATH =
  "data/imports/batch-import-summary.json";
export const DEFAULT_BATCH_IMPORT_FAILURE_ANALYSIS_OUTPUT_PATH =
  "data/imports/import-failure-analysis.json";

export const BATCH_IMPORT_FAILURE_CATEGORY = {
  NO_HISTORICAL_DATA: "no-historical-data",
  MARKET_NOT_FOUND: "market-not-found",
  PROVIDER_UNAVAILABLE: "provider-unavailable",
  RATE_LIMITED: "rate-limited",
  MALFORMED_RESPONSE: "malformed-response",
  UNSUPPORTED_MARKET: "unsupported-market",
  INVALID_METADATA: "invalid-metadata",
  NETWORK_FAILURE: "network-failure",
  UNKNOWN: "unknown",
} as const;

export type BatchImportFailureCategory =
  (typeof BATCH_IMPORT_FAILURE_CATEGORY)[keyof typeof BATCH_IMPORT_FAILURE_CATEGORY];

export const RECOVERABLE_BATCH_IMPORT_FAILURE_CATEGORIES = new Set<
  BatchImportFailureCategory
>([
  BATCH_IMPORT_FAILURE_CATEGORY.RATE_LIMITED,
  BATCH_IMPORT_FAILURE_CATEGORY.NETWORK_FAILURE,
  BATCH_IMPORT_FAILURE_CATEGORY.PROVIDER_UNAVAILABLE,
]);

export type BatchImportFailureExample = {
  marketTicker: string;
  configPath: string;
  errorMessage: string;
};

export type BatchImportFailureReasonGroup = {
  code: BatchImportFailureCategory;
  count: number;
  percentage: number;
  examples: readonly BatchImportFailureExample[];
};

export type BatchImportFailureAnalysis = {
  totalConfigs: number;
  successfulImports: number;
  failedImports: number;
  failureReasons: readonly BatchImportFailureReasonGroup[];
  recoverableFailures: number;
  unrecoverableFailures: number;
  recommendations: readonly string[];
};

export type BuildBatchImportFailureAnalysisInput = {
  totalConfigs: number;
  successfulImports: number;
  failedImports: number;
  failedMarkets: readonly BatchImportMarketResult[];
  maxExamplesPerReason?: number;
};

export const BatchImportFailureAnalysisErrorCode = {
  INVALID_JSON: "invalid-json",
  INVALID_SCHEMA: "invalid-schema",
  MISSING_SUMMARY_FILE: "missing-summary-file",
} as const;

export type BatchImportFailureAnalysisErrorCode =
  (typeof BatchImportFailureAnalysisErrorCode)[keyof typeof BatchImportFailureAnalysisErrorCode];

export class BatchImportFailureAnalysisError extends Error {
  readonly code: BatchImportFailureAnalysisErrorCode;

  constructor(message: string, code: BatchImportFailureAnalysisErrorCode) {
    super(message);
    this.name = "BatchImportFailureAnalysisError";
    this.code = code;
  }
}
