export const EXPANSION_RUN_HISTORY_FILENAME = "expansion-run-history.json";
export const DEFAULT_EXPANSION_RUN_HISTORY_OUTPUT_PATH =
  "data/research-results/expansion-run-history.json";
export const DEFAULT_EXPANSION_RUN_HISTORY_HTML_PATH =
  "data/reports/expansion-run-history.html";

export const DEFAULT_EXPANSION_RUN_HISTORY_MAX_RUNS = 100;
export const EXPANSION_RUN_HISTORY_SCHEMA_VERSION = 1;

export const EXPANSION_RUN_TREND_DIRECTIONS = [
  "improving",
  "declining",
  "stable",
  "insufficient-data",
] as const;

export type ExpansionRunTrendDirection =
  (typeof EXPANSION_RUN_TREND_DIRECTIONS)[number];

export type ExpansionRunHistoryRun = {
  runId: string;
  generatedAt: string;
  summarySourcePath: string;
  maxMarkets: number | null;
  plannedCount: number;
  importedCount: number;
  failedCount: number;
  skippedCount: number;
  unsupportedCount: number;
  rateLimitedCount: number;
  backoffDurationMs: number;
  elapsedMs: number;
  importsPerMinute: number | null;
  discoveryTimeEstimateMs: number;
  discoveryOverheadShare: number | null;
  discoverySegmentsCacheHit: number;
  discoverySegmentsRefreshed: number;
  estimatedDiscoverySavingsMs: number;
  cacheEnabled: boolean;
  discoverySegmentsCorrupt: number;
  sampleStrategy: string;
  adaptiveThrottleEnabled: boolean;
  resultingFixtureCount: number | null;
  resultingAtlasMarketCount: number | null;
  researchYieldPerImportedMarket: number | null;
  importSuccessRate: number | null;
  unsupportedRate: number | null;
  rateLimitRate: number | null;
  execute: boolean;
  runStatus: string;
};

export type ExpansionRunHistoryDocument = {
  schemaVersion: number;
  generatedAt: string;
  outputPath: string;
  htmlOutputPath: string;
  maxRunsRetained: number;
  runs: readonly ExpansionRunHistoryRun[];
};

export type ExpansionRunTrendSeries = {
  direction: ExpansionRunTrendDirection;
  values: readonly {
    runId: string;
    generatedAt: string;
    value: number | null;
  }[];
};

export type ExpansionRunHistoryTrends = {
  importSuccessRate: ExpansionRunTrendSeries;
  unsupportedRate: ExpansionRunTrendSeries;
  rateLimitRate: ExpansionRunTrendSeries;
  discoveryOverheadShare: ExpansionRunTrendSeries;
  importsPerMinute: ExpansionRunTrendSeries;
  researchYieldPerImportedMarket: ExpansionRunTrendSeries;
};

export type ExpansionRunHistoryHighlights = {
  latestRun: ExpansionRunHistoryRun | null;
  bestThroughputRun: {
    runId: string;
    generatedAt: string;
    importsPerMinute: number;
    importedCount: number;
  } | null;
  worstBottleneckRun: {
    runId: string;
    generatedAt: string;
    discoveryOverheadShare: number;
    discoveryTimeEstimateMs: number;
  } | null;
  efficiencyImproving: boolean | null;
};

export type ExpansionRunHistorySummary = {
  runCount: number;
  corruptedPreviousHistoryRecovered: boolean;
};

export type ExpansionRunHistoryReport = {
  generatedAt: string;
  outputPath: string;
  htmlOutputPath: string;
  historyPath: string;
  summary: ExpansionRunHistorySummary;
  trends: ExpansionRunHistoryTrends;
  highlights: ExpansionRunHistoryHighlights;
  runs: readonly ExpansionRunHistoryRun[];
};

export type ExpansionRunHistoryInputPaths = {
  expansionImportSummaryPath: string;
  expansionImportCheckpointPath: string;
  expansionRebuildSummaryPath: string;
  experimentIndexPath: string;
  importConfigsDir: string;
  importsDir: string;
  historyPath: string;
};

export type ExpansionRunHistoryIo = {
  readFile: (path: string) => string;
  fileExists: (path: string) => boolean;
  readdir: (path: string) => readonly string[];
  isDirectory: (path: string) => boolean;
};

export class ExpansionRunHistoryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExpansionRunHistoryError";
  }
}
