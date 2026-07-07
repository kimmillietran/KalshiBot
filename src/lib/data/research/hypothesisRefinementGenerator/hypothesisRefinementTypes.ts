import type { HypothesisFailureAnalysisEntry } from "@/lib/data/research/hypothesisFailureAnalysis/hypothesisFailureAnalysisTypes";
import type { HypothesisPriorityCategory } from "@/lib/data/research/hypothesisFailureAnalysis/hypothesisFailureAnalysisTypes";
import type { HypothesisValidationEntry } from "@/lib/data/research/hypothesisRobustness/hypothesisRobustnessTypes";
import type { MispricingAtlas } from "@/lib/data/research/mispricingAtlas/mispricingAtlasTypes";
import type { CrossValidationEntry } from "@/lib/data/research/crossValidation/crossValidationTypes";

export const HYPOTHESIS_REFINEMENTS_FILENAME = "hypothesis-refinements.json";
export const DEFAULT_HYPOTHESIS_REFINEMENTS_OUTPUT_PATH =
  "data/research-results/hypothesis-refinements.json";
export const DEFAULT_HYPOTHESIS_REFINEMENTS_HTML_PATH =
  "data/reports/hypothesis-refinements.html";

export const DEFAULT_HYPOTHESIS_FAILURE_ANALYSIS_INPUT_PATH =
  "data/research-results/hypothesis-failure-analysis.json";

export const HYPOTHESIS_REFINEMENT_STATUS = "candidate-refinement" as const;

export const HYPOTHESIS_REFINEMENT_TYPES = [
  "probability-bucket-split",
  "time-bucket-split",
  "volatility-regime-split",
  "exclude-reversing-months",
  "month-stable-subset",
  "official-settlement-only",
  "derived-settlement-aware",
] as const;

export type HypothesisRefinementType = (typeof HYPOTHESIS_REFINEMENT_TYPES)[number];

export type OverfittingRiskLevel = "low" | "medium" | "high";

export type HypothesisRefinementFilters = {
  excludedMonths?: readonly string[];
  includedMonths?: readonly string[];
  probabilityRangeLabel?: string;
  timeBucketId?: string;
  volatilityBucketId?: string;
  settlementMode?: "official-only" | "derived-aware";
};

export type HypothesisRefinementCandidate = {
  refinementId: string;
  parentHypothesisId: string;
  parentHypothesis: string;
  refinementType: HypothesisRefinementType;
  refinedHypothesis: string;
  rationale: string;
  expectedBenefit: string;
  expectedRisk: string;
  overfittingRisk: OverfittingRiskLevel;
  priorityRank: number;
  priorityScore: number;
  status: typeof HYPOTHESIS_REFINEMENT_STATUS;
  parentPriorityCategory: HypothesisPriorityCategory;
  parentRobustnessScore: number;
  parentScoreGap: number;
  suggestedFilters: HypothesisRefinementFilters;
  atlasSupportObservations: number | null;
};

export type HypothesisRefinementSummary = {
  totalParentsConsidered: number;
  parentsWithRefinements: number;
  totalRefinements: number;
  refinementsByType: Record<HypothesisRefinementType, number>;
  nearPromisingParents: number;
  skippedLikelySpurious: number;
  skippedCoverageBlocked: number;
};

export type HypothesisRefinementInputPaths = {
  hypothesisFailureAnalysisPath: string;
  hypothesisValidationPath: string;
  mispricingAtlasPath: string;
  crossValidationPath: string;
};

export type HypothesisRefinementInputStatus = {
  hypothesisFailureAnalysisPresent: boolean;
  hypothesisValidationPresent: boolean;
  mispricingAtlasPresent: boolean;
  crossValidationPresent: boolean;
};

export type HypothesisRefinementReport = {
  generatedAt: string;
  outputPath: string;
  htmlOutputPath: string;
  inputPaths: HypothesisRefinementInputPaths;
  inputStatus: HypothesisRefinementInputStatus;
  disclaimer: string;
  summary: HypothesisRefinementSummary;
  refinements: readonly HypothesisRefinementCandidate[];
};

export type ParsedHypothesisRefinementInputs = {
  failureAnalyses: readonly HypothesisFailureAnalysisEntry[];
  validations: readonly HypothesisValidationEntry[];
  mispricingAtlas: MispricingAtlas | null;
  crossValidationEntries: readonly CrossValidationEntry[];
};

export type BuildHypothesisRefinementReportInput = {
  generatedAt: string;
  outputPath: string;
  htmlOutputPath: string;
  inputPaths: HypothesisRefinementInputPaths;
  inputStatus: HypothesisRefinementInputStatus;
  failureAnalyses: readonly HypothesisFailureAnalysisEntry[];
  validations: readonly HypothesisValidationEntry[];
  mispricingAtlas: MispricingAtlas | null;
  crossValidationEntries: readonly CrossValidationEntry[];
};

export type HypothesisRefinementIo = {
  readFile: (path: string) => string;
  fileExists: (path: string) => boolean;
};

export class HypothesisRefinementError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HypothesisRefinementError";
  }
}

export const HYPOTHESIS_REFINEMENT_DISCLAIMER =
  "Generated refinements are exploratory candidates only. They are not validated hypotheses and must not be promoted or traded without a full validation pass.";
