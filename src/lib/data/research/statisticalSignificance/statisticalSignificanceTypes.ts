import type { ResearchMarketResultSummary } from "../aggregation/researchAggregateTypes";
import type { ParsedStrategyAggregateSummary } from "../leaderboard/strategyLeaderboardTypes";

export const STATISTICAL_SIGNIFICANCE_FILENAME = "statistical-significance.json";
export const DEFAULT_STATISTICAL_SIGNIFICANCE_INPUT_DIR = "data/research-results";
export const DEFAULT_STATISTICAL_SIGNIFICANCE_OUTPUT_PATH =
  "data/research-results/statistical-significance.json";

export const DEFAULT_BOOTSTRAP_SEED = 42;
export const DEFAULT_BOOTSTRAP_SIMULATION_COUNT = 1_000;
export const DEFAULT_CONFIDENCE_LEVEL = 0.95;
export const DEFAULT_SIGNIFICANCE_ALPHA = 0.05;

export type ConfidenceInterval = {
  lower: number;
  upper: number;
  pointEstimate: number;
};

export type StrategyConfidenceIntervals95 = {
  meanPnlCents: ConfidenceInterval | null;
  winRatePct: ConfidenceInterval | null;
};

export type StrategyStatisticalSignificanceMetrics = {
  strategyId: string;
  sampleSize: number;
  completedMarkets: number;
  totalTrades: number;
  meanPnlCents: number | null;
  meanPnlStandardError: number | null;
  meanPnlTStatistic: number | null;
  meanPnlPValueOneTailed: number | null;
  meanPnlBootstrapConfidenceInterval: ConfidenceInterval | null;
  winRatePct: number | null;
  winRateBootstrapConfidenceInterval: ConfidenceInterval | null;
  confidenceInterval95: StrategyConfidenceIntervals95;
  statisticallySignificant: boolean;
  insufficientSample: boolean;
  warnings: readonly string[];
  sourcePaths: readonly string[];
};

export type StatisticalSignificanceConfig = {
  seed: number;
  simulationCount: number;
  confidenceLevel: number;
  significanceAlpha: number;
};

export type StatisticalSignificanceReport = {
  generatedAt: string;
  inputRoot: string;
  outputPath: string;
  config: StatisticalSignificanceConfig;
  strategies: readonly StrategyStatisticalSignificanceMetrics[];
};

export type BuildStatisticalSignificanceReportInput = {
  inputRoot: string;
  outputPath: string;
  generatedAt: string;
  summaries: readonly ParsedStrategyAggregateSummary[];
  config?: Partial<StatisticalSignificanceConfig>;
};

export type StatisticalSignificanceIo = {
  readdir: (path: string) => readonly string[];
  readFile: (path: string) => string;
  fileExists: (path: string) => boolean;
  isDirectory: (path: string) => boolean;
};

export type CompletedMarketSample = {
  marketTicker: string;
  totalPnlCents: number;
  winningTradeCount: number;
  tradeCount: number;
};

export type ExtractCompletedMarketSamplesInput = {
  markets: readonly ResearchMarketResultSummary[];
};
