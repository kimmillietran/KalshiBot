import type { HistoricalBronzeImportConfig } from "@/lib/data/importJobs/config";
import type { HistoricalBronzeImportJobResult } from "@/lib/data/importJobs/historicalBronzeImportJobTypes";

export const DEFAULT_BATCH_IMPORT_INPUT_DIR = "data/import-configs";
export const DEFAULT_BATCH_IMPORT_OUTPUT_DIR = "data/imports";
export const BATCH_IMPORT_SUMMARY_FILENAME = "batch-import-summary.json";
export const BATCH_IMPORT_RESULT_FILENAME = "import-result.json";
export const BATCH_IMPORT_CONFIG_FILENAME = "config.json";
export const BATCH_IMPORT_METADATA_FILENAME = "metadata.json";

export const BatchImportRunnerErrorCode = {
  MISSING_INPUT_DIR: "missing-input-dir",
  INVALID_CONFIG_PATH: "invalid-config-path",
  DUPLICATE_OUTPUT_PATH: "duplicate-output-path",
  INVALID_CONCURRENCY: "invalid-concurrency",
} as const;

export type BatchImportRunnerErrorCode =
  (typeof BatchImportRunnerErrorCode)[keyof typeof BatchImportRunnerErrorCode];

export class BatchImportRunnerError extends Error {
  readonly code: BatchImportRunnerErrorCode;
  readonly configPath?: string;
  readonly marketTicker?: string;

  constructor(
    message: string,
    code: BatchImportRunnerErrorCode,
    options?: { configPath?: string; marketTicker?: string },
  ) {
    super(message);
    this.name = "BatchImportRunnerError";
    this.code = code;
    this.configPath = options?.configPath;
    this.marketTicker = options?.marketTicker;
  }
}

export type BatchImportMarketStatus = "success" | "failed" | "skipped";

export type BatchImportMarketResult = {
  marketTicker: string;
  configPath: string;
  outputPath: string;
  status: BatchImportMarketStatus;
  errorMessage: string | null;
  jobId: string | null;
  bronzeRecordCount: number | null;
  valid: boolean | null;
};

export type BatchImportSummary = {
  inputDir: string;
  outputDir: string;
  concurrency: number;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  totalConfigs: number;
  successfulImports: number;
  failedImports: number;
  skippedImports: number;
  summaryPath: string;
  markets: readonly BatchImportMarketResult[];
};

export type BatchImportFilesystem = {
  exists: (path: string) => boolean;
  readFile: (path: string) => string;
  writeFile: (path: string, data: string) => void;
  mkdir: (path: string) => void;
  listConfigPaths: (inputDir: string) => readonly string[];
};

export type RunSingleBatchImportInput = {
  configPath: string;
  config: HistoricalBronzeImportConfig;
};

export type RunSingleBatchImportFn = (
  input: RunSingleBatchImportInput,
) => Promise<HistoricalBronzeImportJobResult>;

export type RunBatchHistoricalImportInput = {
  inputDir: string;
  outputDir: string;
  concurrency?: number;
};

export type BatchHistoricalImportRunnerDeps = {
  filesystem: BatchImportFilesystem;
  runImport: RunSingleBatchImportFn;
  now?: () => Date;
};

export type BatchImportJob = {
  configPath: string;
  outputPath: string;
  marketTicker: string;
  config: HistoricalBronzeImportConfig | null;
  parseErrorMessage: string | null;
  skipReason: string | null;
};
