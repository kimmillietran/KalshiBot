import type { HistoricalResearchCliInput } from "@/lib/data/fixtures/historicalFixtureTypes";

export const DEFAULT_BATCH_RESEARCH_REGISTRY_DIR = "data/research-datasets";
export const DEFAULT_BATCH_RESEARCH_OUTPUT_DIR = "data/research-results";
export const DEFAULT_BATCH_RESEARCH_SUMMARY_FILENAME = "batch-research-summary.json";
export const DATASET_REGISTRY_FILENAME = "dataset-registry.json";
export const BATCH_RESEARCH_OUTPUT_FILENAME = "research-output.json";

export const BatchResearchRunnerErrorCode = {
  MISSING_REGISTRY_DIR: "missing-registry-dir",
  MISSING_REGISTRY: "missing-registry",
  INVALID_REGISTRY: "invalid-registry",
  DUPLICATE_OUTPUT_PATH: "duplicate-output-path",
  INVALID_CONCURRENCY: "invalid-concurrency",
} as const;

export type BatchResearchRunnerErrorCode =
  (typeof BatchResearchRunnerErrorCode)[keyof typeof BatchResearchRunnerErrorCode];

export class BatchResearchRunnerError extends Error {
  readonly code: BatchResearchRunnerErrorCode;
  readonly registryPath?: string;
  readonly marketTicker?: string;

  constructor(
    message: string,
    code: BatchResearchRunnerErrorCode,
    options?: { registryPath?: string; marketTicker?: string },
  ) {
    super(message);
    this.name = "BatchResearchRunnerError";
    this.code = code;
    this.registryPath = options?.registryPath;
    this.marketTicker = options?.marketTicker;
  }
}

export type BatchResearchMarketStatus = "success" | "failed" | "skipped";

export type BatchResearchMarketResult = {
  seriesTicker: string;
  marketTicker: string;
  registryPath: string;
  fixturePath: string;
  outputPath: string;
  status: BatchResearchMarketStatus;
  errorMessage: string | null;
  fixtureValid: boolean | null;
  runId: string | null;
};

export type BatchResearchSummary = {
  registryDir: string;
  outputDir: string;
  summaryPath: string;
  concurrency: number;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  totalDatasets: number;
  successfulRuns: number;
  failedRuns: number;
  skippedRuns: number;
  markets: readonly BatchResearchMarketResult[];
};

export type ResearchDatasetRegistryMarketEntry = {
  seriesTicker: string;
  marketTicker: string;
  fixturePath: string;
  validationStatus?: {
    valid: boolean;
  };
};

export type ResearchDatasetSeriesRegistryDocument = {
  seriesTicker: string;
  markets: readonly ResearchDatasetRegistryMarketEntry[];
};

export type BatchResearchFilesystem = {
  exists: (path: string) => boolean;
  readFile: (path: string) => string;
  writeFile: (path: string, data: string) => void;
  mkdir: (path: string) => void;
  listRegistryPaths: (registryDir: string) => readonly string[];
};

export type RunSingleBatchResearchInput = {
  registryPath: string;
  entry: ResearchDatasetRegistryMarketEntry;
  fixture: HistoricalResearchCliInput;
};

export type RunSingleBatchResearchFn = (
  input: RunSingleBatchResearchInput,
) => string;

export type RunBatchResearchInput = {
  registryDir: string;
  outputDir: string;
  summaryPath?: string;
  concurrency?: number;
};

export type BatchResearchRunnerDeps = {
  filesystem: BatchResearchFilesystem;
  parseFixtureJson: (json: string, marketTicker?: string) => HistoricalResearchCliInput;
  runResearch: RunSingleBatchResearchFn;
  now?: () => Date;
};

export type BatchResearchJob = {
  registryPath: string;
  entry: ResearchDatasetRegistryMarketEntry;
  outputPath: string;
  fixture: HistoricalResearchCliInput | null;
  parseErrorMessage: string | null;
  skipReason: string | null;
};
