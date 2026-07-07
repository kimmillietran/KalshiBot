import { DEFAULT_HYPOTHESIS_CANDIDATES_OUTPUT_PATH } from "@/lib/data/research/hypothesisCandidates/hypothesisCandidateTypes";
import { DEFAULT_HYPOTHESIS_VALIDATION_OUTPUT_PATH } from "@/lib/data/research/hypothesisRobustness/hypothesisRobustnessTypes";
import { DEFAULT_MISPRICING_ATLAS_INPUT_PATH } from "@/lib/data/research/hypothesisCandidates/hypothesisCandidateTypes";

export const RESEARCH_DIMENSION_EXPLORER_FILENAME = "research-dimension-explorer.json";
export const DEFAULT_RESEARCH_DIMENSION_EXPLORER_OUTPUT_PATH =
  "data/research-results/research-dimension-explorer.json";
export const DEFAULT_RESEARCH_DIMENSION_EXPLORER_HTML_PATH =
  "data/reports/research-dimension-explorer.html";

export const RESEARCH_DIMENSION_EXPLORER_RECOMMENDATION_KINDS = [
  "expand-dimension",
  "poor-coverage",
  "high-hypothesis-yield",
  "zero-hypothesis-yield",
  "dimensionality-explosion",
  "refine-buckets",
] as const;

export type ResearchDimensionExplorerRecommendationKind =
  (typeof RESEARCH_DIMENSION_EXPLORER_RECOMMENDATION_KINDS)[number];

export type ResearchDimensionExplorerInputPaths = {
  mispricingAtlasPath: string;
  hypothesisCandidatesPath: string;
  hypothesisValidationPath: string;
};

export const DEFAULT_RESEARCH_DIMENSION_EXPLORER_INPUT_PATHS: ResearchDimensionExplorerInputPaths =
  {
    mispricingAtlasPath: DEFAULT_MISPRICING_ATLAS_INPUT_PATH,
    hypothesisCandidatesPath: DEFAULT_HYPOTHESIS_CANDIDATES_OUTPUT_PATH,
    hypothesisValidationPath: DEFAULT_HYPOTHESIS_VALIDATION_OUTPUT_PATH,
  };

export type ResearchDimensionExplorerInputStatus = {
  mispricingAtlasPresent: boolean;
  hypothesisCandidatesPresent: boolean;
  hypothesisValidationPresent: boolean;
};

export type ResearchDimensionSampleSizeStats = {
  min: number | null;
  max: number | null;
  median: number | null;
  mean: number | null;
  p25: number | null;
  p75: number | null;
};

export type ResearchDimensionExplorerDimensionEntry = {
  dimensionId: string;
  label: string;
  bucketCount: number;
  populatedBucketCount: number;
  coverage: number | null;
  observationCount: number;
  sparsity: number | null;
  entropy: number | null;
  missingRate: number | null;
  sampleSizes: ResearchDimensionSampleSizeStats;
  axisGroupIds: readonly string[];
};

export type ResearchDimensionExplorerAxisGroupEntry = {
  groupId: string;
  dimensionIds: readonly string[];
  combinationCount: number;
  populatedCombinations: number;
  emptyCombinations: number;
  populationRate: number | null;
  candidateYield: number;
  validationYield: number;
  totalObservations: number;
  largestCombinationObservations: number;
  smallestPopulatedCombinationObservations: number | null;
};

export type ResearchDimensionExplorerRecommendation = {
  kind: ResearchDimensionExplorerRecommendationKind;
  label: string;
  rationale: string;
  dimensionId: string | null;
  groupId: string | null;
  priorityRank: number;
};

export type ResearchDimensionExplorerVisualization = {
  dimensionGraph: readonly {
    dimensionId: string;
    label: string;
    axisGroupIds: readonly string[];
    bucketCount: number;
  }[];
  coverageHeatmap: readonly {
    dimensionId: string;
    bucketId: string;
    observations: number;
    coverageShare: number | null;
  }[];
  combinationSizes: readonly {
    groupId: string;
    combinationCount: number;
    populatedCombinations: number;
  }[];
  populationHistogram: readonly {
    groupId: string;
    bucketId: string;
    observations: number;
  }[];
  sparsityWarnings: readonly {
    dimensionId: string | null;
    groupId: string | null;
    message: string;
  }[];
  largestGroups: readonly {
    groupId: string;
    bucketId: string;
    observations: number;
  }[];
  smallestGroups: readonly {
    groupId: string;
    bucketId: string;
    observations: number;
  }[];
};

export type ResearchDimensionExplorerSummary = {
  dimensionCount: number;
  axisGroupCount: number;
  totalRegistryBuckets: number;
  totalPopulatedBuckets: number | null;
  totalObservations: number | null;
  totalCandidates: number;
  totalValidations: number;
  recommendationCount: number;
};

export type ResearchDimensionExplorerReport = {
  generatedAt: string;
  outputPath: string;
  htmlOutputPath: string;
  inputPaths: ResearchDimensionExplorerInputPaths;
  inputStatus: ResearchDimensionExplorerInputStatus;
  summary: ResearchDimensionExplorerSummary;
  dimensions: readonly ResearchDimensionExplorerDimensionEntry[];
  axisGroups: readonly ResearchDimensionExplorerAxisGroupEntry[];
  recommendations: readonly ResearchDimensionExplorerRecommendation[];
  visualization: ResearchDimensionExplorerVisualization;
};

export type ResearchDimensionExplorerIo = {
  readFile: (path: string) => string;
  fileExists: (path: string) => boolean;
};

export class ResearchDimensionExplorerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ResearchDimensionExplorerError";
  }
}
