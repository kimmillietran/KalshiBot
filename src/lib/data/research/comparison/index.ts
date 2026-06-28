export {
  COMPARISON_METRIC_ORDER,
  ComparisonMetricId,
  ResearchComparisonError,
  ResearchComparisonErrorCode,
} from "./comparisonTypes";
export type {
  ComparisonMetricTableRow,
  ComparisonMetricValues,
  ComparisonSummary,
  ComparisonTieGroup,
  MetricDominanceEntry,
  RankedExperiment,
  ResearchComparison,
  ResearchExperimentResultWithMetrics,
} from "./comparisonTypes";

export {
  compareResearchExperiments,
  serializeResearchComparison,
} from "./ResearchComparison";
