import type { HistoricalBronzeImportConfig } from "@/lib/data/importJobs/config";
import type { HistoricalBronzeImportJobResult } from "@/lib/data/importJobs/historicalBronzeImportJobTypes";
import type { KalshiMarketWireShape } from "@/lib/data/importers/kalshi/kalshiMarketImportDiagnostics";
import type { HistoricalImportProvenance } from "@/lib/data/importers/kalshi/kalshiHistoricalTypes";

export const DEFAULT_SINGLE_MARKET_EXPANSION_IMPORT_DEBUG_JSON_PATH =
  "data/research-results/single-market-expansion-import-debug.json";
export const DEFAULT_SINGLE_MARKET_EXPANSION_IMPORT_DEBUG_HTML_PATH =
  "data/reports/single-market-expansion-import-debug.html";

export const SingleMarketExpansionImportDebugErrorCode = {
  MISSING_EXPANSION_CONFIG: "missing-expansion-config",
  INVALID_EXPANSION_CONFIG: "invalid-expansion-config",
  JOB_NOT_FOUND: "job-not-found",
  INVALID_MARKET_TICKER: "invalid-market-ticker",
} as const;

export type SingleMarketExpansionImportDebugErrorCode =
  (typeof SingleMarketExpansionImportDebugErrorCode)[keyof typeof SingleMarketExpansionImportDebugErrorCode];

export class SingleMarketExpansionImportDebugError extends Error {
  readonly code: SingleMarketExpansionImportDebugErrorCode;

  constructor(message: string, code: SingleMarketExpansionImportDebugErrorCode) {
    super(message);
    this.name = "SingleMarketExpansionImportDebugError";
    this.code = code;
  }
}

export type SingleMarketPayloadAvailability = {
  available: boolean;
  requestPath: string | null;
  missingRequiredFields: readonly string[];
  unavailableReason: string | null;
};

export type SingleMarketExpansionImportDebugExpirationValueSource =
  | "detail"
  | "reconciled-from-list"
  | "missing";

export type SingleMarketExpansionImportDebugReconciliation = {
  success: boolean;
  mergedFields: readonly string[];
  mergedMissingRequiredFields: readonly string[];
  detailMissingRequiredFields: readonly string[];
  listMissingRequiredFields: readonly string[];
};

export type SingleMarketExpansionImportDebugImportStatus =
  | "planned"
  | "imported"
  | "failed"
  | "skipped";

export type SingleMarketExpansionImportDebugReport = {
  generatedAt: string;
  marketTicker: string;
  seriesTicker: string;
  execute: boolean;
  inputPath: string;
  outputPath: string;
  htmlOutputPath: string;
  jobId: string | null;
  listPayload: SingleMarketPayloadAvailability;
  detailPayload: SingleMarketPayloadAvailability;
  expirationValueSource: SingleMarketExpansionImportDebugExpirationValueSource;
  reconciliation: SingleMarketExpansionImportDebugReconciliation;
  importStatus: SingleMarketExpansionImportDebugImportStatus;
  failureReason: string | null;
  debugArtifactPaths: readonly string[];
  configPath: string | null;
  importResultPath: string | null;
  durationMs: number;
};

export type SingleMarketExpansionImportDebugIo = {
  readFile: (path: string) => string;
  fileExists: (path: string) => boolean;
  writeFile: (path: string, data: string) => void;
  mkdirSync: (path: string, options: { recursive: boolean }) => void;
};

export type SingleMarketExpansionImportDebugConfig = {
  marketTicker: string;
  inputPath: string;
  outputPath: string;
  htmlOutputPath: string;
  importConfigsDir: string;
  importsDir: string;
  execute: boolean;
  jobId: string | null;
};

export type FetchedSingleMarketListWire = {
  wire: KalshiMarketWireShape | null;
  requestPath: string;
  provenance: HistoricalImportProvenance | null;
  unavailableReason: string | null;
};

export type FetchedSingleMarketDetailWire = {
  wire: KalshiMarketWireShape | null;
  requestPath: string;
  httpStatus: number;
  unavailableReason: string | null;
};

export type SingleMarketExpansionImportDebugDeps = {
  fetchListMarketWire: (input: {
    marketTicker: string;
    seriesTicker: string;
  }) => Promise<FetchedSingleMarketListWire>;
  fetchDetailMarketWire: (marketTicker: string) => Promise<FetchedSingleMarketDetailWire>;
  runImport: (config: HistoricalBronzeImportConfig) => Promise<HistoricalBronzeImportJobResult>;
};

export type RunSingleMarketExpansionImportDebugInput = {
  generatedAt: string;
  config: SingleMarketExpansionImportDebugConfig;
  expansionConfigJson: string;
  io: SingleMarketExpansionImportDebugIo;
  deps: SingleMarketExpansionImportDebugDeps;
};
