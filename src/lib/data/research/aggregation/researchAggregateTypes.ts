export const ResearchAggregateErrorCode = {
  MISSING_INPUT_DIRECTORY: "missing-input-directory",
  MISSING_RESEARCH_OUTPUT: "missing-research-output",
  INVALID_OUTPUT_SCHEMA: "invalid-output-schema",
  DUPLICATE_MARKET_RESULT: "duplicate-market-result",
  MISSING_METRICS: "missing-metrics",
  EMPTY_DATASET: "empty-dataset",
  AGGREGATE_INCONSISTENCY: "aggregate-inconsistency",
} as const;

export type ResearchAggregateErrorCode =
  (typeof ResearchAggregateErrorCode)[keyof typeof ResearchAggregateErrorCode];

export class ResearchAggregateError extends Error {
  readonly code: ResearchAggregateErrorCode;
  readonly marketTicker?: string;

  constructor(
    message: string,
    code: ResearchAggregateErrorCode,
    marketTicker?: string,
  ) {
    super(message);
    this.name = "ResearchAggregateError";
    this.code = code;
    this.marketTicker = marketTicker;
  }
}

export type ResearchOutputStatus = "completed" | "failed";

export type ResearchOutputMetrics = {
  totalPnlCents: number;
  totalReturnPct: number;
  maxDrawdownPct: number;
  sharpeRatio: number | null;
  winRatePct: number;
  lossRatePct: number;
  tradeCount: number;
  winningTradeCount: number;
  losingTradeCount: number;
  /** Simulated ledger fills (buys and sells) for the run. */
  fillCount: number;
  /** Sum of fill quantities across all simulated fills. */
  contractsFilled: number;
};

export type ParsedResearchOutput = {
  marketTicker: string;
  status: ResearchOutputStatus;
  durationMs: number;
  metrics: ResearchOutputMetrics | null;
  error: string | null;
};

export type ScannedResearchOutput = {
  seriesTicker: string;
  marketTicker: string;
  outputPath: string;
  outputJson?: string;
};

export type ResearchMarketResultSummary = {
  marketTicker: string;
  outputPath: string;
  status: ResearchOutputStatus;
  durationMs: number;
  metrics: ResearchOutputMetrics | null;
  error: string | null;
};

export type ResearchMarketCounts = {
  total: number;
  completed: number;
  failed: number;
};

export type ResearchDurationStatistics = {
  totalDurationMs: number;
  averageDurationMs: number;
  medianDurationMs: number;
  minDurationMs: number;
  maxDurationMs: number;
};

export type ResearchAggregatePerformanceStatistics = {
  /** Closed round-trip trades (including settlement closes). */
  totalTrades: number;
  /** Simulated ledger fills summed across completed markets. */
  totalFills: number;
  /** Sum of fill quantities summed across completed markets. */
  totalContractsFilled: number;
  totalPnlCents: number;
  averagePnlCents: number;
  medianPnlCents: number;
  averageReturnPct: number;
  winRatePct: number;
  lossRatePct: number;
  maxDrawdownPct: number;
  sharpeRatio: number | null;
};

export type ResearchSeriesAggregateSummary = {
  generatedAt: string;
  seriesTicker: string;
  inputRoot: string;
  marketCounts: ResearchMarketCounts;
  performance: ResearchAggregatePerformanceStatistics;
  duration: ResearchDurationStatistics;
  markets: readonly ResearchMarketResultSummary[];
};

export type BuildResearchAggregateSummaryInput = {
  inputRoot: string;
  seriesTicker: string;
  generatedAt: string;
  scanned: readonly ScannedResearchOutput[];
};

export type ResearchAggregateIo = {
  readdir: (path: string) => readonly string[];
  readFile: (path: string) => string;
  fileExists: (path: string) => boolean;
  isDirectory: (path: string) => boolean;
};
