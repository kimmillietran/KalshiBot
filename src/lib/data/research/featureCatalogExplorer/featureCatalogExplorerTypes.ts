import { DEFAULT_RESEARCH_DIMENSION_EXPLORER_OUTPUT_PATH } from "@/lib/data/research/researchDimensionExplorer/researchDimensionExplorerTypes";
import {
  DEFAULT_RESEARCH_PORTFOLIO_ANALYTICS_OUTPUT_PATH,
  DEFAULT_RESEARCH_ROI_ANALYSIS_OUTPUT_PATH,
} from "@/lib/data/research/researchRecommendationEngine/researchRecommendationEngineTypes";
import { DEFAULT_FEATURE_DUPLICATION_ANALYSIS_OUTPUT_PATH } from "@/lib/data/research/featureCatalog/featureCatalogTypes";

export const FEATURE_CATALOG_EXPLORER_FILENAME = "feature-catalog.json";
export const DEFAULT_FEATURE_CATALOG_EXPLORER_OUTPUT_PATH =
  "data/research-results/feature-catalog.json";
export const DEFAULT_FEATURE_CATALOG_EXPLORER_HTML_PATH =
  "data/reports/feature-catalog.html";

export type FeatureCatalogExplorerInputPaths = {
  dimensionExplorerPath: string;
  portfolioAnalyticsPath: string;
  roiAnalysisPath: string;
  duplicationAnalysisPath: string;
};

export const DEFAULT_FEATURE_CATALOG_EXPLORER_INPUT_PATHS: FeatureCatalogExplorerInputPaths =
  {
    dimensionExplorerPath: DEFAULT_RESEARCH_DIMENSION_EXPLORER_OUTPUT_PATH,
    portfolioAnalyticsPath: DEFAULT_RESEARCH_PORTFOLIO_ANALYTICS_OUTPUT_PATH,
    roiAnalysisPath: DEFAULT_RESEARCH_ROI_ANALYSIS_OUTPUT_PATH,
    duplicationAnalysisPath: DEFAULT_FEATURE_DUPLICATION_ANALYSIS_OUTPUT_PATH,
  };

export type FeatureCatalogExplorerInputStatus = {
  dimensionExplorerPresent: boolean;
  portfolioAnalyticsPresent: boolean;
  roiAnalyticsPresent: boolean;
  duplicationAnalysisPresent: boolean;
};

export type FeatureCatalogExplorerFeatureEntry = {
  featureId: string;
  label: string;
  sourceLayer: string;
  canonicalSource: string;
  implemented: boolean;
  onMispricingObservation: boolean;
  registeredAsResearchDimension: boolean;
  researchDimensionId: string | null;
  participatesInAxisGroups: readonly string[];
  bucketCount: number | null;
  candidateYield: number | null;
  averageRobustness: number | null;
  coverageNotes: string | null;
  duplicationStatus: string | null;
  usedInResearch: boolean;
};

export type FeatureCatalogExplorerSummary = {
  totalFeatures: number;
  implementedFeatures: number;
  missingIndicators: number;
  usedInResearchCount: number;
  computedButUnusedCount: number;
  dimensionsWithoutCatalogCount: number;
  eligibleForFutureDimensionCount: number;
  registryDimensionCount: number;
  optionalArtifactsAvailable: number;
  optionalArtifactsTotal: number;
};

export type FeatureCatalogExplorerReport = {
  generatedAt: string;
  outputPath: string;
  htmlOutputPath: string;
  inputPaths: FeatureCatalogExplorerInputPaths;
  inputStatus: FeatureCatalogExplorerInputStatus;
  summary: FeatureCatalogExplorerSummary;
  features: readonly FeatureCatalogExplorerFeatureEntry[];
  computedButUnused: readonly string[];
  dimensionsWithoutCatalogMetadata: readonly string[];
  eligibleForFutureDimensions: readonly string[];
  genuinelyMissingIndicators: readonly string[];
  recommendedNextFeatureDimensions: readonly {
    featureId: string;
    label: string;
    rationale: string;
  }[];
};

export type FeatureCatalogExplorerIo = {
  readFile: (path: string) => string;
  fileExists: (path: string) => boolean;
};

export class FeatureCatalogExplorerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FeatureCatalogExplorerError";
  }
}
