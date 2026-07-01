import type {
  ResearchAggregatePerformanceStatistics,
  ResearchDurationStatistics,
  ResearchMarketCounts,
  ResearchMarketResultSummary,
} from "../aggregation/researchAggregateTypes";

export const StrategyLeaderboardErrorCode = {
  MISSING_INPUT_DIRECTORY: "missing-input-directory",
  MISSING_AGGREGATE_SUMMARY: "missing-aggregate-summary",
  INVALID_AGGREGATE_SUMMARY: "invalid-aggregate-summary",
  DUPLICATE_STRATEGY: "duplicate-strategy",
  DUPLICATE_MARKET_RESULT: "duplicate-market-result",
  INVALID_RANK_METRIC: "invalid-rank-metric",
  EMPTY_DATASET: "empty-dataset",
} as const;

export type StrategyLeaderboardErrorCode =
  (typeof StrategyLeaderboardErrorCode)[keyof typeof StrategyLeaderboardErrorCode];

export class StrategyLeaderboardError extends Error {
  readonly code: StrategyLeaderboardErrorCode;
  readonly strategyId?: string;

  constructor(
    message: string,
    code: StrategyLeaderboardErrorCode,
    strategyId?: string,
  ) {
    super(message);
    this.name = "StrategyLeaderboardError";
    this.code = code;
    this.strategyId = strategyId;
  }
}

export const STRATEGY_LEADERBOARD_RANK_METRICS = [
  "totalPnL",
  "sharpe",
  "winRate",
] as const;

export type StrategyLeaderboardRankMetric =
  (typeof STRATEGY_LEADERBOARD_RANK_METRICS)[number];

export const DEFAULT_STRATEGY_LEADERBOARD_INPUT_DIR = "data/research-results";
export const DEFAULT_STRATEGY_LEADERBOARD_OUTPUT_PATH =
  "data/leaderboards/strategy-leaderboard.json";

export type ParsedStrategyAggregateSummary = {
  strategyId: string;
  sourcePaths: readonly string[];
  marketCounts: ResearchMarketCounts;
  performance: ResearchAggregatePerformanceStatistics;
  duration: ResearchDurationStatistics;
  markets: readonly ResearchMarketResultSummary[];
};

export type StrategyLeaderboardEntry = {
  rank: number;
  strategyId: string;
  marketsTested: number;
  completedMarkets: number;
  totalTrades: number;
  totalPnlCents: number;
  averagePnlCents: number;
  medianPnlCents: number;
  winRatePct: number;
  maxDrawdownPct: number;
  sharpeRatio: number | null;
  averageDurationMs: number;
  sourcePaths: readonly string[];
};

export type StrategyLeaderboard = {
  generatedAt: string;
  inputRoot: string;
  outputPath: string;
  rankBy: StrategyLeaderboardRankMetric;
  strategies: readonly StrategyLeaderboardEntry[];
};

export type BuildStrategyLeaderboardInput = {
  inputRoot: string;
  outputPath: string;
  generatedAt: string;
  rankBy: StrategyLeaderboardRankMetric;
  summaries: readonly ParsedStrategyAggregateSummary[];
};

export type StrategyLeaderboardIo = {
  readdir: (path: string) => readonly string[];
  readFile: (path: string) => string;
  fileExists: (path: string) => boolean;
  isDirectory: (path: string) => boolean;
};

export type ScannedStrategyAggregateSummary = {
  strategyId: string;
  summaryPath: string;
  summaryJson: string;
};
