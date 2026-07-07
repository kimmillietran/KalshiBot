import type { HypothesisFailureReasonCategory } from "@/lib/data/research/hypothesisFailureAnalysis/hypothesisFailureAnalysisTypes";
import type { HypothesisAtlasGroupId } from "@/lib/data/research/hypothesisCandidates/hypothesisCandidateTypes";
import type { ResearchDimensionId } from "@/lib/data/research/dimensions/types";

export const RESEARCH_PORTFOLIO_ANALYTICS_FILENAME = "research-portfolio-analytics.json";
export const DEFAULT_RESEARCH_PORTFOLIO_ANALYTICS_OUTPUT_PATH =
  "data/research-results/research-portfolio-analytics.json";
export const DEFAULT_RESEARCH_PORTFOLIO_ANALYTICS_HTML_PATH =
  "data/reports/research-portfolio-analytics.html";

export const DEFAULT_HYPOTHESIS_VALIDATION_PASS_SCORE = 70;

export const ROBUSTNESS_DISTRIBUTION_BUCKET_IDS = [
  "0-34",
  "35-49",
  "50-59",
  "60-69",
  "70-100",
] as const;

export type RobustnessDistributionBucketId =
  (typeof ROBUSTNESS_DISTRIBUTION_BUCKET_IDS)[number];

export type RobustnessDistributionEntry = {
  bucketId: RobustnessDistributionBucketId;
  count: number;
};

export type FailureReasonHistogramEntry = {
  category: HypothesisFailureReasonCategory;
  count: number;
};

export type PortfolioAnalyticsMetrics = {
  candidateCount: number;
  validationCount: number;
  passCount: number;
  passRate: number | null;
  averageRobustness: number | null;
  medianRobustness: number | null;
  robustnessDistribution: readonly RobustnessDistributionEntry[];
  averageScoreGap: number | null;
  nearPromisingCount: number;
  likelySpuriousCount: number;
  blockedByCoverageCount: number;
  averageObservationCount: number | null;
  averageUniqueTradingDays: number | null;
  failureReasonHistogram: readonly FailureReasonHistogramEntry[];
  averageMonthInstability: number | null;
  averageRegimeInstability: number | null;
};

export type PortfolioDimensionAnalyticsEntry = PortfolioAnalyticsMetrics & {
  dimensionId: ResearchDimensionId;
  label: string;
};

export type PortfolioAxisGroupAnalyticsEntry = PortfolioAnalyticsMetrics & {
  groupId: HypothesisAtlasGroupId;
  dimensionIds: readonly ResearchDimensionId[];
};

export type PortfolioRankingEntry = {
  id: string;
  label: string;
  rank: number;
  value: number;
  metric: string;
};

export type PortfolioAnalyticsRankings = {
  highestYieldingDimensions: readonly PortfolioRankingEntry[];
  strongestRobustnessDimensions: readonly PortfolioRankingEntry[];
  weakestRobustnessDimensions: readonly PortfolioRankingEntry[];
  mostPromisingDimensions: readonly PortfolioRankingEntry[];
  leastProductiveDimensions: readonly PortfolioRankingEntry[];
  highestYieldingAxisGroups: readonly PortfolioRankingEntry[];
  strongestRobustnessAxisGroups: readonly PortfolioRankingEntry[];
  weakestRobustnessAxisGroups: readonly PortfolioRankingEntry[];
  mostPromisingAxisGroups: readonly PortfolioRankingEntry[];
  leastProductiveAxisGroups: readonly PortfolioRankingEntry[];
};

export type ResearchPortfolioAnalyticsInputPaths = {
  hypothesisValidationPath: string;
  hypothesisFailureAnalysisPath: string;
  hypothesisCandidatesPath: string;
  crossValidationPath: string;
  coverageAwareValidationPath: string;
  researchDimensionExplorerPath: string;
};

export const DEFAULT_RESEARCH_PORTFOLIO_ANALYTICS_INPUT_PATHS: ResearchPortfolioAnalyticsInputPaths =
  {
    hypothesisValidationPath: "data/research-results/hypothesis-validation.json",
    hypothesisFailureAnalysisPath: "data/research-results/hypothesis-failure-analysis.json",
    hypothesisCandidatesPath: "data/research-results/hypothesis-candidates.json",
    crossValidationPath: "data/research-results/cross-validation.json",
    coverageAwareValidationPath: "data/research-results/coverage-aware-validation.json",
    researchDimensionExplorerPath: "data/research-results/research-dimension-explorer.json",
  };

export type ResearchPortfolioAnalyticsInputStatus = {
  hypothesisValidationPresent: boolean;
  hypothesisFailureAnalysisPresent: boolean;
  hypothesisCandidatesPresent: boolean;
  crossValidationPresent: boolean;
  coverageAwareValidationPresent: boolean;
  researchDimensionExplorerPresent: boolean;
};

export type ResearchPortfolioAnalyticsSummary = {
  totalCandidates: number;
  totalValidations: number;
  totalPasses: number;
  overallPassRate: number | null;
  dimensionCount: number;
  axisGroupCount: number;
  passScoreThreshold: number;
};

export type ResearchPortfolioAnalyticsReport = {
  generatedAt: string;
  outputPath: string;
  htmlOutputPath: string;
  inputPaths: ResearchPortfolioAnalyticsInputPaths;
  inputStatus: ResearchPortfolioAnalyticsInputStatus;
  summary: ResearchPortfolioAnalyticsSummary;
  dimensions: readonly PortfolioDimensionAnalyticsEntry[];
  axisGroups: readonly PortfolioAxisGroupAnalyticsEntry[];
  rankings: PortfolioAnalyticsRankings;
};

export type ResearchPortfolioAnalyticsIo = {
  readFile: (path: string) => string;
  fileExists: (path: string) => boolean;
};

export class ResearchPortfolioAnalyticsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ResearchPortfolioAnalyticsError";
  }
}
