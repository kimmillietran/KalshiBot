import type {
  HistoricalBacktestMetricsConfig,
} from "@/lib/data/backtesting";
import type { BacktestFillSimulationConfig, BacktestStrategy } from "@/lib/data/backtesting/strategyTypes";
import type { HistoricalDataset } from "@/lib/data/datasets";
import type { HistoricalResearchRun } from "@/lib/data/cli";
import type { RawHistoricalRecord } from "@/lib/data/types";
import type { EngineConfig } from "@/types/domain/trading";

export const HistoricalResearchRunnerErrorCode = {
  EMPTY_BRONZE_RECORDS: "empty-bronze-records",
  MISSING_RUN_ID: "missing-run-id",
  MISSING_STRATEGY: "missing-strategy",
  INVALID_STRATEGY_ID: "invalid-strategy-id",
  INVALID_INITIAL_CASH: "invalid-initial-cash",
  INVALID_DURATION_MS: "invalid-duration-ms",
  INVALID_CONFIG: "invalid-config",
} as const;

export type HistoricalResearchRunnerErrorCode =
  (typeof HistoricalResearchRunnerErrorCode)[keyof typeof HistoricalResearchRunnerErrorCode];

export class HistoricalResearchRunnerError extends Error {
  readonly code: HistoricalResearchRunnerErrorCode;

  constructor(message: string, code: HistoricalResearchRunnerErrorCode) {
    super(message);
    this.name = "HistoricalResearchRunnerError";
    this.code = code;
  }
}

export type RunHistoricalResearchFromBronzeInput = {
  bronzeRecords: readonly RawHistoricalRecord[];
  strategy: BacktestStrategy;
  engineConfig: EngineConfig;
  initialCashCents: number;
  runId: string;
  durationMs: number;
  fillConfig?: BacktestFillSimulationConfig;
  metricsConfig?: HistoricalBacktestMetricsConfig;
};

export type HistoricalResearchRunnerMetadata = {
  runId: string;
  durationMs: number;
  strategyId: string;
  datasetId: string;
  snapshotCount: number;
  bronzeRecordCount: number;
};

export type HistoricalResearchRunnerCoreResult = {
  dataset: HistoricalDataset;
  researchRun: HistoricalResearchRun;
  metadata: HistoricalResearchRunnerMetadata;
};

export type HistoricalResearchRunnerResult = HistoricalResearchRunnerCoreResult & {
  serialized: string;
};
