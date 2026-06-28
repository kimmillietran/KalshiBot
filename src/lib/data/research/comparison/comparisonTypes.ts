import type { BacktestMetricsSummary } from "@/lib/data/backtesting/metricsTypes";

/** Sweep-layer experiment result with backtest metrics required for comparison. */
export type ResearchExperimentResultWithMetrics = {
  experimentId: string;
  sweepId: string;
  parameters: Readonly<Record<string, unknown>>;
  status: string;
  metrics: BacktestMetricsSummary;
};
export const ComparisonMetricId = {
  FINAL_EQUITY: "final-equity",
  TOTAL_RETURN: "total-return",
  CAGR: "cagr",
  SHARPE: "sharpe",
  MAX_DRAWDOWN: "max-drawdown",
  PROFIT_FACTOR: "profit-factor",
  WIN_RATE: "win-rate",
  EXPECTANCY: "expectancy",
  TRADE_COUNT: "trade-count",
} as const;

export type ComparisonMetricId =
  (typeof ComparisonMetricId)[keyof typeof ComparisonMetricId];

export const COMPARISON_METRIC_ORDER: readonly ComparisonMetricId[] = [
  ComparisonMetricId.FINAL_EQUITY,
  ComparisonMetricId.TOTAL_RETURN,
  ComparisonMetricId.CAGR,
  ComparisonMetricId.SHARPE,
  ComparisonMetricId.MAX_DRAWDOWN,
  ComparisonMetricId.PROFIT_FACTOR,
  ComparisonMetricId.WIN_RATE,
  ComparisonMetricId.EXPECTANCY,
  ComparisonMetricId.TRADE_COUNT,
];

/** Normalized metric values extracted from completed experiment results. */
export type ComparisonMetricValues = {
  finalEquityCents: number;
  totalReturnPct: number;
  cagrPct: number | null;
  sharpeRatio: number | null;
  maxDrawdownPct: number;
  profitFactor: number | null;
  winRatePct: number;
  expectancyCents: number;
  tradeCount: number;
};

export type RankedExperiment = {
  rank: number;
  experimentId: string;
  sweepId: string;
  parameters: Readonly<Record<string, unknown>>;
  metrics: ComparisonMetricValues;
  tiedExperimentIds: readonly string[];
};

export type ComparisonMetricTableRow = {
  experimentId: string;
  metrics: ComparisonMetricValues;
};

export type MetricDominanceEntry = {
  metricId: ComparisonMetricId;
  leaderExperimentIds: readonly string[];
  leaderValue: number | null;
  direction: "higher-is-better" | "lower-is-better";
};

export type ComparisonTieGroup = {
  rank: number;
  experimentIds: readonly string[];
};

export type ComparisonSummary = {
  experimentCount: number;
  winnerExperimentId: string;
  tiedWinnerExperimentIds: readonly string[];
  metricLeaders: readonly MetricDominanceEntry[];
};

export type ResearchComparison = {
  comparisonId: string;
  winner: RankedExperiment;
  rankings: readonly RankedExperiment[];
  summary: ComparisonSummary;
  metricTable: readonly ComparisonMetricTableRow[];
  dominance: readonly MetricDominanceEntry[];
  ties: readonly ComparisonTieGroup[];
};

export const ResearchComparisonErrorCode = {
  EMPTY_EXPERIMENTS: "empty-experiments",
  INVALID_EXPERIMENT_STATUS: "invalid-experiment-status",
  INVALID_EXPERIMENT_METRICS: "invalid-experiment-metrics",
  DUPLICATE_EXPERIMENT_ID: "duplicate-experiment-id",
} as const;

export type ResearchComparisonErrorCode =
  (typeof ResearchComparisonErrorCode)[keyof typeof ResearchComparisonErrorCode];

const ERROR_MESSAGES: Record<ResearchComparisonErrorCode, string> = {
  [ResearchComparisonErrorCode.EMPTY_EXPERIMENTS]:
    "Research comparison requires at least one completed experiment result",
  [ResearchComparisonErrorCode.INVALID_EXPERIMENT_STATUS]:
    "Research comparison requires completed experiment results",
  [ResearchComparisonErrorCode.INVALID_EXPERIMENT_METRICS]:
    "Research comparison requires finite experiment metrics",
  [ResearchComparisonErrorCode.DUPLICATE_EXPERIMENT_ID]:
    "Research comparison requires unique experiment ids",
};

export class ResearchComparisonError extends Error {
  readonly code: ResearchComparisonErrorCode;
  readonly experimentId?: string;

  constructor(
    code: ResearchComparisonErrorCode,
    options?: { experimentId?: string },
  ) {
    super(ERROR_MESSAGES[code]);
    this.name = "ResearchComparisonError";
    this.code = code;
    this.experimentId = options?.experimentId;
  }
}
