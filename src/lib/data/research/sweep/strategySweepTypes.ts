import type { HistoricalResearchCliInputDocument } from "@/lib/data/fixtures";
import type { ReplayPricingDiagnosticsRunSummary } from "@/lib/data/research/diagnostics";
import type { StrategyPluginRegistry } from "@/lib/data/strategies/plugin/StrategyPluginRegistry";

export const DEFAULT_STRATEGY_SWEEP_REGISTRY_DIR = "data/research-datasets";
export const DEFAULT_STRATEGY_SWEEP_OUTPUT_DIR = "data/research-results";
export const SWEEP_SUMMARY_FILENAME = "sweep-summary.json";
export const SWEEP_OUTPUT_FILENAME = "research-output.json";
export const SWEEP_DECISION_TRACE_FILENAME = "decision-trace.json";

export type StrategySweepResearchResult = {
  researchOutput: string;
  decisionTrace: string;
};

export const StrategySweepErrorCode = {
  MISSING_REGISTRY_DIR: "missing-registry-dir",
  MISSING_REGISTRY: "missing-registry",
  INVALID_REGISTRY: "invalid-registry",
  MISSING_FIXTURE: "missing-fixture",
  INVALID_STRATEGY_CONFIG: "invalid-strategy-config",
  DUPLICATE_STRATEGY_ID: "duplicate-strategy-id",
  DUPLICATE_OUTPUT_PATH: "duplicate-output-path",
  UNKNOWN_STRATEGY_ID: "unknown-strategy-id",
  INVALID_CONCURRENCY: "invalid-concurrency",
  MISSING_STRATEGY_SELECTION: "missing-strategy-selection",
  MISSING_SYNTHESIS_FILE: "missing-synthesis-file",
  INVALID_SYNTHESIS_FILE: "invalid-synthesis-file",
} as const;

export type StrategySweepErrorCode =
  (typeof StrategySweepErrorCode)[keyof typeof StrategySweepErrorCode];

export class StrategySweepError extends Error {
  readonly code: StrategySweepErrorCode;
  readonly strategyId?: string;
  readonly marketTicker?: string;

  constructor(
    message: string,
    code: StrategySweepErrorCode,
    options?: { strategyId?: string; marketTicker?: string },
  ) {
    super(message);
    this.name = "StrategySweepError";
    this.code = code;
    this.strategyId = options?.strategyId;
    this.marketTicker = options?.marketTicker;
  }
}

export type StrategySweepRunStatus = "success" | "failed";

export type StrategySweepMarketEntry = {
  seriesTicker: string;
  marketTicker: string;
  fixturePath: string;
  registryPath: string;
  validationStatus?: {
    valid: boolean;
  };
};

export type StrategySweepSynthesizedMetadata = {
  synthesizedStrategyId: string;
  hypothesisId: string;
  strategyFamily: string;
  pluginStrategyId: string;
};

export type SynthesizedStrategySweepEntry = StrategySweepSynthesizedMetadata & {
  sweepStrategyId: string;
  strategyConfig: Record<string, unknown>;
};

export type StrategySweepRunResult = {
  strategyId: string;
  seriesTicker: string;
  marketTicker: string;
  registryPath: string;
  fixturePath: string;
  outputPath: string;
  status: StrategySweepRunStatus;
  errorMessage: string | null;
  durationMs: number;
  runId: string | null;
  pricingDiagnostics?: ReplayPricingDiagnosticsRunSummary;
  synthesized?: StrategySweepSynthesizedMetadata;
};

export type StrategySweepSummary = {
  registryDir: string;
  outputDir: string;
  summaryPath: string;
  concurrency: number;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  strategiesExecuted: readonly string[];
  includeSynthesized: boolean;
  synthesizedStrategiesExecuted: readonly string[];
  warnings: readonly string[];
  marketsTested: number;
  totalRuns: number;
  successfulRuns: number;
  failedRuns: number;
  runs: readonly StrategySweepRunResult[];
};

export type StrategySweepFilesystem = {
  exists: (path: string) => boolean;
  readFile: (path: string) => string;
  writeFile: (path: string, data: string) => void;
  mkdir: (path: string) => void;
  listRegistryPaths: (registryDir: string) => readonly string[];
};

export type StrategySweepJob = {
  strategyId: string;
  executionStrategyId: string;
  strategyConfig: Record<string, unknown>;
  synthesized?: StrategySweepSynthesizedMetadata;
  entry: StrategySweepMarketEntry;
  outputPath: string;
  fixture: HistoricalResearchCliInputDocument | null;
  parseErrorMessage: string | null;
};

export type RunStrategySweepInput = {
  registryDir: string;
  outputDir: string;
  strategyIds: readonly string[];
  strategyConfig?: unknown;
  parameterSetId?: string;
  concurrency?: number;
  summaryPath?: string;
  writeSummary?: boolean;
  includeSynthesized?: boolean;
  synthesisPath?: string;
};

export type StrategySweepRunnerDeps = {
  filesystem: StrategySweepFilesystem;
  strategyRegistry: StrategyPluginRegistry;
  parseFixtureJson: (json: string, marketTicker?: string) => HistoricalResearchCliInputDocument;
  runResearch: (input: {
    fixture: HistoricalResearchCliInputDocument;
    strategyId: string;
    strategyConfig: Record<string, unknown>;
    synthesized?: StrategySweepSynthesizedMetadata;
  }) => StrategySweepResearchResult;
  now?: () => Date;
  logProgress?: (message: string) => void;
  isProgressTty?: boolean;
};
