import type {
  HistoricalBacktestMetricsConfig,
  HistoricalBacktestResult,
} from "@/lib/data/backtesting";
import type { BacktestFillSimulationConfig, BacktestStrategy } from "@/lib/data/backtesting/strategyTypes";
import type { HistoricalDataset, HistoricalDatasetMetadata } from "@/lib/data/datasets";
import type { EngineConfig } from "@/types/domain/trading";

export const HistoricalResearchCliErrorCode = {
  EMPTY_DATASET: "empty-dataset",
  EMPTY_DATASETS: "empty-datasets",
  MISSING_RUN_ID: "missing-run-id",
  MISSING_STRATEGY: "missing-strategy",
  INVALID_STRATEGY_ID: "invalid-strategy-id",
  INVALID_INITIAL_CASH: "invalid-initial-cash",
  INVALID_DURATION_MS: "invalid-duration-ms",
  INVALID_CONFIG: "invalid-config",
} as const;

export type HistoricalResearchCliErrorCode =
  (typeof HistoricalResearchCliErrorCode)[keyof typeof HistoricalResearchCliErrorCode];

export class HistoricalResearchCliError extends Error {
  readonly code: HistoricalResearchCliErrorCode;

  constructor(message: string, code: HistoricalResearchCliErrorCode) {
    super(message);
    this.name = "HistoricalResearchCliError";
    this.code = code;
  }
}

export const HistoricalResearchProgressEventType = {
  STARTED: "started",
  DATASET_COMPLETE: "dataset-complete",
  FINISHED: "finished",
} as const;

export type HistoricalResearchProgressEventType =
  (typeof HistoricalResearchProgressEventType)[keyof typeof HistoricalResearchProgressEventType];

export type HistoricalResearchProgressEvent =
  | {
      type: typeof HistoricalResearchProgressEventType.STARTED;
      runId: string;
      datasetCount: number;
    }
  | {
      type: typeof HistoricalResearchProgressEventType.DATASET_COMPLETE;
      runId: string;
      datasetIndex: number;
      datasetId: string;
      run: HistoricalResearchRun;
    }
  | {
      type: typeof HistoricalResearchProgressEventType.FINISHED;
      runId: string;
      runs: readonly HistoricalResearchRun[];
    };

export type HistoricalResearchRunConfig = {
  runId: string;
  strategy: BacktestStrategy;
  engineConfig: EngineConfig;
  initialCashCents: number;
  durationMs: number;
  fillConfig?: BacktestFillSimulationConfig;
  metricsConfig?: HistoricalBacktestMetricsConfig;
};

export type RunHistoricalResearchInput = {
  dataset: HistoricalDataset;
  config: HistoricalResearchRunConfig;
  onProgress?: (event: HistoricalResearchProgressEvent) => void;
};

export type RunAllHistoricalResearchInput = {
  datasets: readonly HistoricalDataset[];
  config: HistoricalResearchRunConfig;
  onProgress?: (event: HistoricalResearchProgressEvent) => void;
};

export type HistoricalResearchRun = {
  datasetMetadata: HistoricalDatasetMetadata;
  backtestResult: HistoricalBacktestResult;
  durationMs: number;
  config: HistoricalResearchRunConfig;
};
