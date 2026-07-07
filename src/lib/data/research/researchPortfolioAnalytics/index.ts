export {
  aggregatePortfolioMetricsByAxisGroup,
  aggregatePortfolioMetricsByDimension,
  buildPortfolioAnalyticsRankings,
  buildPortfolioHypothesisRecords,
  resolveGroupDimensionIds,
  resolvePassScoreThreshold,
} from "./aggregatePortfolioAnalytics";
export type { PortfolioHypothesisRecord } from "./aggregatePortfolioAnalytics";

export { buildResearchPortfolioAnalyticsReport } from "./buildResearchPortfolioAnalyticsReport";

export {
  loadResearchPortfolioAnalyticsInputs,
} from "./loadResearchPortfolioAnalyticsInputs";
export type { LoadedResearchPortfolioAnalyticsInputs } from "./loadResearchPortfolioAnalyticsInputs";

export {
  buildFailureReasonHistogram,
  buildRobustnessDistribution,
  computeMean,
  computeMedian,
  computeMonthInstability,
  computePassRate,
  computeRegimeInstability,
  resolveRobustnessDistributionBucketId,
  roundMetric,
} from "./portfolioAnalyticsMath";

export { serializeResearchPortfolioAnalyticsHtml } from "./serializeResearchPortfolioAnalyticsHtml";
export { serializeResearchPortfolioAnalyticsReport } from "./serializeResearchPortfolioAnalyticsReport";

export {
  DEFAULT_HYPOTHESIS_VALIDATION_PASS_SCORE,
  DEFAULT_RESEARCH_PORTFOLIO_ANALYTICS_HTML_PATH,
  DEFAULT_RESEARCH_PORTFOLIO_ANALYTICS_INPUT_PATHS,
  DEFAULT_RESEARCH_PORTFOLIO_ANALYTICS_OUTPUT_PATH,
  RESEARCH_PORTFOLIO_ANALYTICS_FILENAME,
  ResearchPortfolioAnalyticsError,
  ROBUSTNESS_DISTRIBUTION_BUCKET_IDS,
} from "./researchPortfolioAnalyticsTypes";

export type {
  FailureReasonHistogramEntry,
  PortfolioAnalyticsMetrics,
  PortfolioAnalyticsRankings,
  PortfolioAxisGroupAnalyticsEntry,
  PortfolioDimensionAnalyticsEntry,
  PortfolioRankingEntry,
  ResearchPortfolioAnalyticsInputPaths,
  ResearchPortfolioAnalyticsInputStatus,
  ResearchPortfolioAnalyticsIo,
  ResearchPortfolioAnalyticsReport,
  ResearchPortfolioAnalyticsSummary,
  RobustnessDistributionBucketId,
  RobustnessDistributionEntry,
} from "./researchPortfolioAnalyticsTypes";
