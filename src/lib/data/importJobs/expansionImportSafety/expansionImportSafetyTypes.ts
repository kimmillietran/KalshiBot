export const DEFAULT_HISTORICAL_EXPANSION_IMPORT_CHECKPOINT_PATH =
  "data/research-results/historical-expansion-import-checkpoint.json";

export type ExpansionImportCheckpointRunStatus =
  | "running"
  | "completed"
  | "partial"
  | "interrupted";

export type ExpansionImportSummaryRunStatus =
  | "completed"
  | "partial"
  | "interrupted";

export type ExpansionImportFailedMarketCheckpoint = {
  marketTicker: string;
  retryCount: number;
  lastErrorMessage: string | null;
  lastAttemptAt: string;
};

export type ExpansionImportJobCheckpoint = {
  jobId: string;
  lastCompletedMarketTicker: string | null;
  completedMarkets: readonly string[];
  failedMarkets: readonly ExpansionImportFailedMarketCheckpoint[];
};

export type HistoricalExpansionImportCheckpoint = {
  generatedAt: string;
  updatedAt: string;
  inputPath: string;
  checkpointPath: string;
  resume: boolean;
  runStatus: ExpansionImportCheckpointRunStatus;
  maxRetries: number;
  jobs: readonly ExpansionImportJobCheckpoint[];
};

export type ExpansionImportSafetyConfig = {
  resume: boolean;
  skipFailed: boolean;
  forceMarket: string | null;
  checkpointPath: string;
  maxRetries: number;
  summaryInputPath: string | null;
};

export type ExpansionMarketExecutionPlan =
  | { action: "execute" }
  | { action: "skip"; reason: string }
  | { action: "retry"; retryCount: number };

export type ExpansionImportCheckpointIo = {
  readFile: (path: string) => string;
  fileExists: (path: string) => boolean;
  writeFile: (path: string, data: string) => void;
};
