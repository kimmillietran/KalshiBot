export {
  ResearchAggregateError,
  ResearchAggregateErrorCode,
} from "./researchAggregateTypes";
export type {
  BuildResearchAggregateSummaryInput,
  ParsedResearchOutput,
  ResearchAggregateIo,
  ResearchAggregatePerformanceStatistics,
  ResearchDurationStatistics,
  ResearchMarketCounts,
  ResearchMarketResultSummary,
  ResearchOutputMetrics,
  ResearchOutputStatus,
  ResearchSeriesAggregateSummary,
  ScannedResearchOutput,
} from "./researchAggregateTypes";

export {
  AGGREGATE_SUMMARY_FILENAME,
  RESEARCH_OUTPUT_FILENAME,
  assertSafePathSegment,
  buildMarketResultKey,
  buildResearchOutputPath,
  buildSeriesAggregateOutputPath,
  compareMarketSummaries,
  normalizeRootPath,
} from "./researchAggregatePaths";

export { parseResearchOutputJson } from "./parseResearchOutputJson";
export {
  computeDurationStatistics,
  computeMarketCounts,
  computePerformanceStatistics,
  toMarketResultSummary,
} from "./computeResearchAggregateStatistics";

export {
  buildResearchAggregateSummaries,
  buildResearchAggregateSummariesFromDirectories,
  buildResearchAggregateOutputPaths,
  buildResearchAggregateSummary,
  scanResearchOutputs,
  serializeResearchAggregateSummary,
} from "./buildResearchAggregateSummary";
