import type { BuildHistoricalResearchFixtureFromImportResultInput } from "@/lib/data/importJobs/fixtureBridge";
import type { HistoricalBronzeImportJobCoreResult } from "@/lib/data/importJobs/historicalBronzeImportJobTypes";

export const DEFAULT_BATCH_FIXTURE_INPUT_DIR = "data/imports";
export const DEFAULT_BATCH_FIXTURE_OUTPUT_DIR = "data/fixtures";
export const DEFAULT_BATCH_FIXTURE_SUMMARY_FILENAME = "batch-fixtures-summary.json";
export const BATCH_FIXTURE_IMPORT_RESULT_FILENAME = "import-result.json";
export const BATCH_FIXTURE_OUTPUT_FILENAME = "fixture.json";

export const BatchFixtureBridgeRunnerErrorCode = {
  MISSING_INPUT_DIR: "missing-input-dir",
  INVALID_IMPORT_PATH: "invalid-import-path",
  DUPLICATE_OUTPUT_PATH: "duplicate-output-path",
} as const;

export type BatchFixtureBridgeRunnerErrorCode =
  (typeof BatchFixtureBridgeRunnerErrorCode)[keyof typeof BatchFixtureBridgeRunnerErrorCode];

export class BatchFixtureBridgeRunnerError extends Error {
  readonly code: BatchFixtureBridgeRunnerErrorCode;
  readonly importPath?: string;
  readonly marketTicker?: string;

  constructor(
    message: string,
    code: BatchFixtureBridgeRunnerErrorCode,
    options?: { importPath?: string; marketTicker?: string },
  ) {
    super(message);
    this.name = "BatchFixtureBridgeRunnerError";
    this.code = code;
    this.importPath = options?.importPath;
    this.marketTicker = options?.marketTicker;
  }
}

export type BatchFixtureMarketStatus = "success" | "failed" | "skipped";

export type BatchFixtureMarketResult = {
  marketTicker: string;
  importPath: string;
  fixturePath: string;
  status: BatchFixtureMarketStatus;
  errorMessage: string | null;
  importValid: boolean | null;
  jobId: string | null;
};

export type BatchFixtureBridgeSummary = {
  inputDir: string;
  outputDir: string;
  summaryPath: string;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  totalImports: number;
  successfulFixtures: number;
  failedFixtures: number;
  skippedFixtures: number;
  markets: readonly BatchFixtureMarketResult[];
};

export type BatchFixtureBridgeFilesystem = {
  exists: (path: string) => boolean;
  readFile: (path: string) => string;
  writeFile: (path: string, data: string) => void;
  mkdir: (path: string) => void;
  listImportPaths: (inputDir: string) => readonly string[];
};

export type RunSingleBatchFixtureBridgeInput = {
  importPath: string;
  importResult: HistoricalBronzeImportJobCoreResult;
  marketTicker: string;
};

export type RunSingleBatchFixtureBridgeFn = (
  input: RunSingleBatchFixtureBridgeInput,
) => string;

export type BatchFixtureBridgeOptions = Partial<
  Omit<BuildHistoricalResearchFixtureFromImportResultInput, "importResult">
>;

export type RunBatchFixtureBridgeInput = {
  inputDir: string;
  outputDir: string;
  summaryPath?: string;
  bridgeOptions?: BatchFixtureBridgeOptions;
};

export type BatchFixtureBridgeRunnerDeps = {
  filesystem: BatchFixtureBridgeFilesystem;
  runFixtureBridge: RunSingleBatchFixtureBridgeFn;
  now?: () => Date;
};

export type BatchFixtureBridgeJob = {
  importPath: string;
  fixturePath: string;
  marketTicker: string;
  importResult: HistoricalBronzeImportJobCoreResult | null;
  parseErrorMessage: string | null;
  skipReason: string | null;
};
