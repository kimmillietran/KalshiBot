import { DEFAULT_HYPOTHESIS_FAILURE_ANALYSIS_OUTPUT_PATH } from "@/lib/data/research/hypothesisFailureAnalysis/hypothesisFailureAnalysisTypes";
import { DEFAULT_RESEARCH_DIMENSION_EXPLORER_OUTPUT_PATH } from "@/lib/data/research/researchDimensionExplorer/researchDimensionExplorerTypes";
import { DEFAULT_MONTH_REGIME_ANALYSIS_OUTPUT_PATH } from "@/lib/data/research/researchWorkflow/researchWorkflowTypes";

export const RESEARCH_RECOMMENDATIONS_FILENAME = "research-recommendations.json";
export const DEFAULT_RESEARCH_RECOMMENDATIONS_OUTPUT_PATH =
  "data/research-results/research-recommendations.json";
export const DEFAULT_RESEARCH_RECOMMENDATIONS_HTML_PATH =
  "data/reports/research-recommendations.html";

export const DEFAULT_RESEARCH_PORTFOLIO_ANALYTICS_OUTPUT_PATH =
  "data/research-results/research-portfolio-analytics.json";
export const DEFAULT_RESEARCH_ROI_ANALYSIS_OUTPUT_PATH =
  "data/research-results/research-roi-analysis.json";
export const DEFAULT_RESEARCH_INTERACTION_ANALYSIS_OUTPUT_PATH =
  "data/research-results/research-interaction-analysis.json";

export const RESEARCH_RECOMMENDATION_KINDS = [
  "expand-research-family",
  "reduce-exploration-focus",
  "split-dimension-buckets",
  "increase-sampling-window",
  "investigate-interaction",
  "deprioritize-sparse-dimension",
  "recommend-registry-dimension",
  "recommend-interaction-family",
  "recommend-refinement-priority",
] as const;

export type ResearchRecommendationKind =
  (typeof RESEARCH_RECOMMENDATION_KINDS)[number];

export type ResearchRecommendationConfidence = "high" | "medium" | "low";

export type ResearchRecommendationEngineInputPaths = {
  portfolioAnalyticsPath: string;
  roiAnalysisPath: string;
  interactionAnalysisPath: string;
  dimensionExplorerPath: string;
  failureAnalysisPath: string;
  monthRegimeAnalysisPath: string;
};

export const DEFAULT_RESEARCH_RECOMMENDATION_ENGINE_INPUT_PATHS: ResearchRecommendationEngineInputPaths =
  {
    portfolioAnalyticsPath: DEFAULT_RESEARCH_PORTFOLIO_ANALYTICS_OUTPUT_PATH,
    roiAnalysisPath: DEFAULT_RESEARCH_ROI_ANALYSIS_OUTPUT_PATH,
    interactionAnalysisPath: DEFAULT_RESEARCH_INTERACTION_ANALYSIS_OUTPUT_PATH,
    dimensionExplorerPath: DEFAULT_RESEARCH_DIMENSION_EXPLORER_OUTPUT_PATH,
    failureAnalysisPath: DEFAULT_HYPOTHESIS_FAILURE_ANALYSIS_OUTPUT_PATH,
    monthRegimeAnalysisPath: DEFAULT_MONTH_REGIME_ANALYSIS_OUTPUT_PATH,
  };

export type ResearchRecommendationEngineInputStatus = {
  portfolioAnalyticsPresent: boolean;
  roiAnalysisPresent: boolean;
  interactionAnalysisPresent: boolean;
  dimensionExplorerPresent: boolean;
  failureAnalysisPresent: boolean;
  monthRegimeAnalysisPresent: boolean;
};

export type ResearchRecommendationEntry = {
  rank: number;
  kind: ResearchRecommendationKind;
  title: string;
  rationale: string;
  explanation: string;
  confidence: ResearchRecommendationConfidence;
  sourceArtifacts: readonly string[];
  signals: Record<string, string | number | boolean | null>;
};

export type ResearchRecommendationEngineSummary = {
  recommendationCount: number;
  artifactsAvailable: number;
  artifactsTotal: number;
  topRecommendation: string | null;
  highConfidenceCount: number;
};

export type ResearchRecommendationEngineReport = {
  generatedAt: string;
  outputPath: string;
  htmlOutputPath: string;
  inputPaths: ResearchRecommendationEngineInputPaths;
  inputStatus: ResearchRecommendationEngineInputStatus;
  summary: ResearchRecommendationEngineSummary;
  recommendations: readonly ResearchRecommendationEntry[];
};

export type ResearchRecommendationEngineIo = {
  readFile: (path: string) => string;
  fileExists: (path: string) => boolean;
};

export class ResearchRecommendationEngineError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ResearchRecommendationEngineError";
  }
}

export const RESEARCH_RECOMMENDATION_KIND_PRIORITY: Record<
  ResearchRecommendationKind,
  number
> = {
  "recommend-refinement-priority": 1,
  "investigate-interaction": 2,
  "expand-research-family": 3,
  "split-dimension-buckets": 4,
  "increase-sampling-window": 5,
  "recommend-registry-dimension": 6,
  "recommend-interaction-family": 7,
  "reduce-exploration-focus": 8,
  "deprioritize-sparse-dimension": 9,
};
