import type { HistoricalTradingSnapshot } from "@/lib/data/snapshots/types";
import type { ReplayStepResult } from "@/lib/data/replay/replaySessionTypes";
import type { EngineConfig } from "@/types/domain/trading";

import type { ResearchCostModelConfig } from "./costModel";
import type { BacktestLedger } from "./BacktestLedger";
import type { BacktestMetricsSummary } from "./metricsTypes";
import type {
  BacktestFillSimulationConfig,
  BacktestStrategy,
  BacktestStrategyRunResult,
} from "./strategyTypes";

export const HistoricalBacktestErrorCode = {
  EMPTY_SNAPSHOTS: "empty-snapshots",
  MISSING_STRATEGY: "missing-strategy",
  INVALID_STRATEGY_ID: "invalid-strategy-id",
  INVALID_INITIAL_CASH: "invalid-initial-cash",
} as const;

export type HistoricalBacktestErrorCode =
  (typeof HistoricalBacktestErrorCode)[keyof typeof HistoricalBacktestErrorCode];

export class HistoricalBacktestError extends Error {
  readonly code: HistoricalBacktestErrorCode;

  constructor(message: string, code: HistoricalBacktestErrorCode) {
    super(message);
    this.name = "HistoricalBacktestError";
    this.code = code;
  }
}

export type HistoricalBacktestMetricsConfig = {
  periodsPerYear?: number;
  riskFreeRatePerPeriod?: number;
};

export type RunHistoricalBacktestInput = {
  snapshots: readonly HistoricalTradingSnapshot[];
  strategy: BacktestStrategy;
  engineConfig: EngineConfig;
  initialCashCents: number;
  fillConfig?: BacktestFillSimulationConfig;
  costModelConfig?: ResearchCostModelConfig;
  metricsConfig?: HistoricalBacktestMetricsConfig;
};

export type HistoricalBacktestReplayResult = {
  results: readonly ReplayStepResult[];
};

export type HistoricalBacktestMetadata = {
  strategyId: string;
  initialCashCents: number;
  completedAtStep: number;
  snapshotCount: number;
  engineConfig: EngineConfig;
  fillConfig: BacktestFillSimulationConfig;
  costModelConfig?: ResearchCostModelConfig;
};

export type HistoricalBacktestResult = {
  replayResult: HistoricalBacktestReplayResult;
  strategyRun: BacktestStrategyRunResult;
  ledger: BacktestLedger;
  metrics: BacktestMetricsSummary;
  metadata: HistoricalBacktestMetadata;
};
