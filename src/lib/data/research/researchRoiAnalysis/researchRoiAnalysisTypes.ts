import type { HypothesisCandidate } from "@/lib/data/research/hypothesisCandidates/hypothesisCandidateTypes";
import type { HypothesisFailureAnalysisEntry } from "@/lib/data/research/hypothesisFailureAnalysis/hypothesisFailureAnalysisTypes";
import type { HypothesisRefinementCandidate } from "@/lib/data/research/hypothesisRefinementGenerator/hypothesisRefinementTypes";
import type { HypothesisValidationEntry } from "@/lib/data/research/hypothesisRobustness/hypothesisRobustnessTypes";
import type { MispricingAtlas } from "@/lib/data/research/mispricingAtlas/mispricingAtlasTypes";

export const RESEARCH_ROI_ANALYSIS_FILENAME = "research-roi-analysis.json";
export const DEFAULT_RESEARCH_ROI_ANALYSIS_OUTPUT_PATH =
  "data/research-results/research-roi-analysis.json";
export const DEFAULT_RESEARCH_ROI_ANALYSIS_HTML_PATH =
  "data/reports/research-roi-analysis.html";

export const RESEARCH_ROI_DIMENSION_IDS = [
  "probability",
  "time",
  "moneyness",
  "volatility",
  "momentum",
  "regime",
  "leadLag",
] as const;

export type ResearchRoiDimensionId = (typeof RESEARCH_ROI_DIMENSION_IDS)[number];

export type ResearchRoiInputPaths = {
  hypothesisCandidatesPath: string;
  hypothesisValidationPath: string;
  hypothesisFailureAnalysisPath: string;
  hypothesisRefinementsPath: string;
  refinementHypothesisCandidatesPath: string;
  mispricingAtlasPath: string;
};

export type ResearchRoiInputStatus = {
  hypothesisCandidatesPresent: boolean;
  hypothesisValidationPresent: boolean;
  hypothesisFailureAnalysisPresent: boolean;
  hypothesisRefinementsPresent: boolean;
  refinementHypothesisCandidatesPresent: boolean;
  mispricingAtlasPresent: boolean;
};

export type ResearchRoiOverallMetrics = {
  totalCandidates: number;
  atlasCandidates: number;
  leadLagCandidates: number;
  refinementCandidates: number;
  validatedCandidates: number;
  failingCandidates: number;
  nearPromisingCandidates: number;
  candidateGenerationEfficiency: number | null;
  validationRate: number | null;
  nearPromisingRate: number | null;
  averageRobustnessScore: number | null;
  averageRobustnessImprovementAfterRefinement: number | null;
  refinementPairsCompared: number;
  totalAtlasBuckets: number;
  nonEmptyAtlasBuckets: number;
  bucketsWithCandidates: number;
  bucketUtilizationRate: number | null;
  validationEfficiency: number | null;
  overallRoiScore: number | null;
};

export type ResearchRoiSliceMetrics = {
  id: string;
  label: string;
  candidateCount: number;
  validatedCount: number;
  nearPromisingCount: number;
  failingCount: number;
  totalBuckets: number;
  bucketsWithCandidates: number;
  nonEmptyBuckets: number;
  candidateYieldPerBucket: number | null;
  validationRate: number | null;
  nearPromisingRate: number | null;
  averageRobustnessScore: number | null;
  bucketUtilizationRate: number | null;
  validationEfficiency: number | null;
  roiScore: number | null;
  researchCostScore: number | null;
  efficiencyScore: number | null;
};

export type ResearchRoiRankings = {
  highestRoiDimensions: readonly ResearchRoiSliceMetrics[];
  lowestRoiDimensions: readonly ResearchRoiSliceMetrics[];
  highestRoiAxisGroups: readonly ResearchRoiSliceMetrics[];
  mostExpensiveResearchAreas: readonly ResearchRoiSliceMetrics[];
  mostEfficientResearchAreas: readonly ResearchRoiSliceMetrics[];
};

export type ResearchRoiRefinementImprovementEntry = {
  parentHypothesisId: string;
  childHypothesisId: string | null;
  parentRobustnessScore: number;
  childRobustnessScore: number | null;
  robustnessDelta: number | null;
  refinementType: string | null;
};

export type ResearchRoiAnalysisSummary = {
  overall: ResearchRoiOverallMetrics;
  rankings: ResearchRoiRankings;
  dimensionMetrics: readonly ResearchRoiSliceMetrics[];
  axisGroupMetrics: readonly ResearchRoiSliceMetrics[];
  bucketMetrics: readonly ResearchRoiSliceMetrics[];
  refinementImprovements: readonly ResearchRoiRefinementImprovementEntry[];
  emptyInputReasons: readonly string[];
};

export type ResearchRoiAnalysisReport = {
  generatedAt: string;
  outputPath: string;
  htmlOutputPath: string;
  inputPaths: ResearchRoiInputPaths;
  inputStatus: ResearchRoiInputStatus;
  disclaimer: string;
  summary: ResearchRoiAnalysisSummary;
};

export type ParsedResearchRoiAnalysisInputs = {
  candidates: readonly HypothesisCandidate[];
  validations: readonly HypothesisValidationEntry[];
  failureAnalyses: readonly HypothesisFailureAnalysisEntry[];
  refinements: readonly HypothesisRefinementCandidate[];
  mispricingAtlas: MispricingAtlas | null;
};

export type BuildResearchRoiAnalysisReportInput = {
  generatedAt: string;
  outputPath: string;
  htmlOutputPath: string;
  inputPaths: ResearchRoiInputPaths;
  inputStatus: ResearchRoiInputStatus;
  candidates: readonly HypothesisCandidate[];
  validations: readonly HypothesisValidationEntry[];
  failureAnalyses: readonly HypothesisFailureAnalysisEntry[];
  refinements: readonly HypothesisRefinementCandidate[];
  mispricingAtlas: MispricingAtlas | null;
};

export type ResearchRoiAnalysisIo = {
  readFile: (path: string) => string;
  fileExists: (path: string) => boolean;
};

export class ResearchRoiAnalysisError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ResearchRoiAnalysisError";
  }
}
