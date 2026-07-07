import type { HypothesisAtlasGroupId } from "@/lib/data/research/hypothesisCandidates/hypothesisCandidateTypes";
import type { ResearchDimensionId } from "@/lib/data/research/dimensions/types";

export const DIMENSION_INTERACTION_ANALYSIS_FILENAME =
  "research-interaction-analysis.json";
export const DEFAULT_DIMENSION_INTERACTION_ANALYSIS_OUTPUT_PATH =
  "data/research-results/research-interaction-analysis.json";
export const DEFAULT_DIMENSION_INTERACTION_ANALYSIS_HTML_PATH =
  "data/reports/research-interaction-analysis.html";

export const DEFAULT_INTERACTION_HYPOTHESIS_CANDIDATES_PATH =
  "data/research-results/hypothesis-candidates.json";
export const DEFAULT_INTERACTION_HYPOTHESIS_VALIDATION_PATH =
  "data/research-results/hypothesis-validation.json";
export const DEFAULT_INTERACTION_MISPRICING_ATLAS_PATH =
  "data/research-results/mispricing-atlas.json";
export const DEFAULT_INTERACTION_FAILURE_ANALYSIS_PATH =
  "data/research-results/hypothesis-failure-analysis.json";

export const DimensionInteractionAnalysisErrorCode = {
  MISSING_INPUT: "missing-input",
  INVALID_JSON: "invalid-json",
  INVALID_DOCUMENT: "invalid-document",
} as const;

export type DimensionInteractionAnalysisErrorCode =
  (typeof DimensionInteractionAnalysisErrorCode)[keyof typeof DimensionInteractionAnalysisErrorCode];

export class DimensionInteractionAnalysisError extends Error {
  readonly code: DimensionInteractionAnalysisErrorCode;

  constructor(message: string, code: DimensionInteractionAnalysisErrorCode) {
    super(message);
    this.name = "DimensionInteractionAnalysisError";
    this.code = code;
  }
}

export type DimensionInteractionMetrics = {
  groupId: HypothesisAtlasGroupId;
  interactionLabel: string;
  dimensionIds: readonly ResearchDimensionId[];
  axisCount: number;
  candidateCount: number;
  validatedCount: number;
  passRate: number;
  averageRobustness: number;
  nearPromisingFrequency: number;
  averageCalibrationError: number;
  coverageQuality: number;
  bucketSparsity: number;
  entropy: number;
  totalBuckets: number;
  nonEmptyBuckets: number;
  interactionScore: number;
};

export type DimensionInteractionRankings = {
  bestInteractions: readonly HypothesisAtlasGroupId[];
  weakestInteractions: readonly HypothesisAtlasGroupId[];
  highPotentialInteractions: readonly HypothesisAtlasGroupId[];
  highNoiseInteractions: readonly HypothesisAtlasGroupId[];
};

export type DimensionInteractionAnalysisSummary = {
  compositeGroupCount: number;
  totalCandidates: number;
  totalValidated: number;
  averageInteractionScore: number;
  emptyInputReasons: readonly string[];
};

export type DimensionInteractionAnalysisInputPaths = {
  hypothesisCandidatesPath: string;
  hypothesisValidationPath: string;
  mispricingAtlasPath: string;
  hypothesisFailureAnalysisPath: string;
};

export type DimensionInteractionAnalysisInputStatus = {
  hypothesisCandidatesPresent: boolean;
  hypothesisValidationPresent: boolean;
  mispricingAtlasPresent: boolean;
  hypothesisFailureAnalysisPresent: boolean;
};

export type DimensionInteractionAnalysisReport = {
  generatedAt: string;
  outputPath: string;
  htmlOutputPath: string;
  inputPaths: DimensionInteractionAnalysisInputPaths;
  inputStatus: DimensionInteractionAnalysisInputStatus;
  config: {
    passScoreThreshold: number;
    minSampleThreshold: number;
    nearPromisingRobustnessFloor: number;
  };
  summary: DimensionInteractionAnalysisSummary;
  interactions: readonly DimensionInteractionMetrics[];
  rankings: DimensionInteractionRankings;
  investigatorNotes: readonly string[];
};

export type DimensionInteractionAnalysisIo = {
  readFile: (path: string) => string;
  fileExists: (path: string) => boolean;
};

export type BuildDimensionInteractionAnalyticsReportInput = {
  generatedAt: string;
  outputPath: string;
  htmlOutputPath: string;
  inputPaths: DimensionInteractionAnalysisInputPaths;
  io: DimensionInteractionAnalysisIo;
  passScoreThreshold?: number;
  minSampleThreshold?: number;
  nearPromisingRobustnessFloor?: number;
};
