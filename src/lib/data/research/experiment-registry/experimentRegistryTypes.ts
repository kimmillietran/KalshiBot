export const EXPERIMENT_RECORD_FILENAME = "experiment.json";
export const DEFAULT_EXPERIMENTS_ROOT = "data/experiments";
export const DEFAULT_EXPERIMENT_RESEARCH_ROOT = "data/research-results";
export const DEFAULT_EXPERIMENT_FIXTURES_ROOT = "data/fixtures";
export const EXPERIMENT_ID_PREFIX = "exp-v1";

export const ExperimentRegistryErrorCode = {
  MISSING_INPUT_DIRECTORY: "missing-input-directory",
  EMPTY_DATASET: "empty-dataset",
  DUPLICATE_EXPERIMENT_ID: "duplicate-experiment-id",
  MISSING_ARTIFACT: "missing-artifact",
  INVALID_METADATA: "invalid-metadata",
  INCOMPLETE_EXPERIMENT: "incomplete-experiment",
  IMMUTABLE_RECORD_CONFLICT: "immutable-record-conflict",
} as const;

export type ExperimentRegistryErrorCode =
  (typeof ExperimentRegistryErrorCode)[keyof typeof ExperimentRegistryErrorCode];

export class ExperimentRegistryError extends Error {
  readonly code: ExperimentRegistryErrorCode;
  readonly experimentId?: string;
  readonly marketTicker?: string;

  constructor(
    message: string,
    code: ExperimentRegistryErrorCode,
    options?: { experimentId?: string; marketTicker?: string },
  ) {
    super(message);
    this.name = "ExperimentRegistryError";
    this.code = code;
    this.experimentId = options?.experimentId;
    this.marketTicker = options?.marketTicker;
  }
}

export type ExperimentLeaderboardEntry = {
  marketTicker: string;
  rank: number;
  totalPnlCents: number | null;
  totalReturnPct: number | null;
  winRatePct: number | null;
};

export type ExperimentLeaderboardSnapshot = {
  sourcePath: string;
  generatedAt: string;
  seriesTicker: string;
  entries: readonly ExperimentLeaderboardEntry[];
};

export type ExperimentRecord = {
  experimentId: string;
  runId: string;
  strategyId: string;
  strategyConfig: Record<string, unknown>;
  costModelConfig: unknown;
  datasetHash: string;
  fixtureHash: string | null;
  engineVersion: string;
  gitCommit: string | null;
  timestamp: string;
  seriesTicker: string;
  marketTicker: string;
  researchOutputLocations: readonly string[];
  calibrationReportLocations: readonly string[];
  leaderboardSnapshot: ExperimentLeaderboardSnapshot | null;
  registeredAt: string;
};

export type ParsedExperimentResearchDocument = {
  runId: string;
  strategyId: string;
  seriesTicker: string;
  marketTicker: string;
  strategyConfig: Record<string, unknown>;
  costModelConfig: unknown;
  datasetHash: string;
  engineVersion: string;
  timestamp: string;
  outputPath: string;
};

export type ScannedExperimentResearchOutput = {
  strategyId: string;
  seriesTicker: string;
  marketTicker: string;
  outputPath: string;
  outputJson: string;
};

export type ExperimentRegistryIo = {
  readdir: (path: string) => readonly string[];
  readFile: (path: string) => string;
  writeFile: (path: string, data: string) => void;
  fileExists: (path: string) => boolean;
  isDirectory: (path: string) => boolean;
  resolveGitCommit?: () => string | null;
};

export type RegisterExperimentsInput = {
  researchRoot: string;
  experimentsRoot: string;
  fixturesRoot: string;
  registeredAt: string;
  gitCommit?: string | null;
};

export type RegisterExperimentsResult = {
  experimentsRoot: string;
  registeredCount: number;
  skippedCount: number;
  experimentIds: readonly string[];
  outputPaths: readonly string[];
};

export type ExperimentIdentityInput = {
  strategyId: string;
  strategyConfig: Record<string, unknown>;
  costModelConfig: unknown;
  datasetHash: string;
  fixtureHash: string | null;
  engineVersion: string;
};
