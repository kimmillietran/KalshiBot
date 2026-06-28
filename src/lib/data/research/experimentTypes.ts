import type { BacktestFillSimulationConfig, BacktestStrategy } from "../backtesting";
import type { BacktestMetricsSummary } from "../backtesting/metricsTypes";
import type { BacktestLedger } from "../backtesting/BacktestLedger";
import type { HistoricalTradingSnapshot } from "../snapshots/types";
import type { ReplayStepResult } from "../replay/replaySessionTypes";

export const ResearchExperimentErrorCode = {
  EMPTY_SNAPSHOTS: "empty-snapshots",
  MISSING_STRATEGY: "missing-strategy",
  INVALID_CONFIG: "invalid-config",
  INVALID_EXPERIMENT_ID: "invalid-experiment-id",
  INVALID_STRATEGY_ID: "invalid-strategy-id",
  INVALID_STRATEGY_CONFIG: "invalid-strategy-config",
  INVALID_INITIAL_CASH: "invalid-initial-cash",
  INVALID_FILL_CONFIG: "invalid-fill-config",
} as const;

export type ResearchExperimentErrorCode =
  (typeof ResearchExperimentErrorCode)[keyof typeof ResearchExperimentErrorCode];

export class ResearchExperimentError extends Error {
  readonly code: ResearchExperimentErrorCode;

  constructor(message: string, code: ResearchExperimentErrorCode) {
    super(message);
    this.name = "ResearchExperimentError";
    this.code = code;
  }
}

/** Serializable strategy parameters preserved on the experiment result. */
export type ResearchStrategyConfig = Readonly<Record<string, unknown>>;

export type ResearchExperimentConfig = {
  experimentId: string;
  strategy: BacktestStrategy;
  strategyConfig: ResearchStrategyConfig;
  initialCashCents: number;
  fillConfig: BacktestFillSimulationConfig;
};

export type ResearchExperimentInput = {
  snapshots: readonly HistoricalTradingSnapshot[];
};

export type ResearchExperimentConfiguration = {
  experimentId: string;
  strategyId: string;
  strategyConfig: ResearchStrategyConfig;
  initialCashCents: number;
  fillConfig: BacktestFillSimulationConfig;
};

export type ResearchExperimentResult = {
  experimentId: string;
  strategyId: string;
  completedAtStep: number;
  replayResults: readonly ReplayStepResult[];
  ledger: BacktestLedger;
  metrics: BacktestMetricsSummary;
  configuration: ResearchExperimentConfiguration;
};

export type RunResearchExperimentInput = {
  config: ResearchExperimentConfig;
  input: ResearchExperimentInput;
};
