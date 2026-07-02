import type { WalkForwardFoldMetadata } from "@/lib/data/research/walkForwardEngine";

export const DEFAULT_WALK_FORWARD_SPLIT_INPUT_DIR = "data/walk-forward";
export const DEFAULT_WALK_FORWARD_SWEEP_OUTPUT_DIR = "data/walk-forward-results";
export const WALK_FORWARD_SWEEP_SUMMARY_FILENAME = "walk-forward-summary.json";
export const WALK_FORWARD_SWEEP_OUTPUT_FILENAME = "research-output.json";

export const WalkForwardSweepErrorCode = {
  MISSING_SPLIT_DIR: "missing-split-dir",
  MISSING_SPLIT_SUMMARY: "missing-split-summary",
  INVALID_SPLIT_SUMMARY: "invalid-split-summary",
  SPLIT_ID_MISMATCH: "split-id-mismatch",
  MISSING_FOLD: "missing-fold",
  DUPLICATE_FOLD_INDEX: "duplicate-fold-index",
  INVALID_FOLD: "invalid-fold",
  EMPTY_VALIDATION_SET: "empty-validation-set",
  DUPLICATE_STRATEGY_ID: "duplicate-strategy-id",
  UNKNOWN_STRATEGY_ID: "unknown-strategy-id",
  MISSING_STRATEGY_SELECTION: "missing-strategy-selection",
  DUPLICATE_OUTPUT_PATH: "duplicate-output-path",
  INVALID_CONCURRENCY: "invalid-concurrency",
  MISSING_FIXTURE: "missing-fixture",
  INVALID_STRATEGY_CONFIG: "invalid-strategy-config",
} as const;

export type WalkForwardSweepErrorCode =
  (typeof WalkForwardSweepErrorCode)[keyof typeof WalkForwardSweepErrorCode];

export class WalkForwardSweepError extends Error {
  readonly code: WalkForwardSweepErrorCode;
  readonly splitId?: string;
  readonly foldIndex?: number;
  readonly strategyId?: string;
  readonly marketTicker?: string;

  constructor(
    message: string,
    code: WalkForwardSweepErrorCode,
    options?: {
      splitId?: string;
      foldIndex?: number;
      strategyId?: string;
      marketTicker?: string;
    },
  ) {
    super(message);
    this.name = "WalkForwardSweepError";
    this.code = code;
    this.splitId = options?.splitId;
    this.foldIndex = options?.foldIndex;
    this.strategyId = options?.strategyId;
    this.marketTicker = options?.marketTicker;
  }
}

export type WalkForwardSweepRunStatus = "success" | "failed";

export type WalkForwardSweepValidationMarketRef = {
  seriesTicker: string;
  marketTicker: string;
  fixturePath: string;
  marketCloseTime: string;
  orderedIndex: number;
  registryPath: string;
};

export type WalkForwardSweepDiscoveredFold = {
  foldIndex: number;
  splitId: string;
  foldPath: string;
  metadata: WalkForwardFoldMetadata;
  validationMarkets: readonly WalkForwardSweepValidationMarketRef[];
};

export type WalkForwardSweepDiscoveredSplit = {
  splitId: string;
  splitInputDir: string;
  splitSummaryPath: string;
  folds: readonly WalkForwardSweepDiscoveredFold[];
};

export type WalkForwardSweepRunResult = {
  splitId: string;
  foldIndex: number;
  strategyId: string;
  seriesTicker: string;
  marketTicker: string;
  fixturePath: string;
  outputPath: string;
  status: WalkForwardSweepRunStatus;
  errorMessage: string | null;
  durationMs: number;
  runId: string | null;
  foldMetadata: WalkForwardFoldMetadata;
};

export type WalkForwardSweepSummary = {
  splitId: string;
  splitInputDir: string;
  outputDir: string;
  summaryPath: string;
  concurrency: number;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  foldsExecuted: number;
  strategiesExecuted: readonly string[];
  marketsEvaluated: number;
  totalRuns: number;
  successfulRuns: number;
  failedRuns: number;
  runs: readonly WalkForwardSweepRunResult[];
};

export type WalkForwardSweepFilesystem = {
  exists: (path: string) => boolean;
  readFile: (path: string) => string;
  writeFile: (path: string, data: string) => void;
  mkdir: (path: string) => void;
};

export type WalkForwardSweepJob = {
  splitId: string;
  foldIndex: number;
  foldMetadata: WalkForwardFoldMetadata;
  strategyId: string;
  strategyConfig: Record<string, unknown>;
  market: WalkForwardSweepValidationMarketRef;
  outputPath: string;
  fixture: import("@/lib/data/fixtures").HistoricalResearchCliInputDocument | null;
  parseErrorMessage: string | null;
};

export type RunWalkForwardStrategySweepInput = {
  splitId: string;
  splitInputDir?: string;
  outputDir?: string;
  strategyIds: readonly string[];
  strategyConfig?: unknown;
  concurrency?: number;
  summaryPath?: string;
};

export type WalkForwardSweepRunnerDeps = {
  filesystem: WalkForwardSweepFilesystem;
  strategyRegistry: import("@/lib/data/strategies/plugin/StrategyPluginRegistry").StrategyPluginRegistry;
  parseFixtureJson: (
    json: string,
    marketTicker?: string,
  ) => import("@/lib/data/fixtures").HistoricalResearchCliInputDocument;
  runResearch: (input: {
    fixture: import("@/lib/data/fixtures").HistoricalResearchCliInputDocument;
    strategyId: string;
    strategyConfig: Record<string, unknown>;
  }) => string;
  now?: () => Date;
};
