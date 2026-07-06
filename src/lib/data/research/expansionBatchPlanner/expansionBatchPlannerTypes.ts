import type { EstimatedSupportLevel } from "@/lib/data/research/coveragePlanner/importability/importabilityTypes";
import type { CoverageDepthStatus } from "@/lib/data/research/coveragePlanner/coveragePlannerTypes";

export const EXPANSION_BATCH_PLAN_SELECTION_STRATEGIES = [
  "research-value",
  "temporal-balance",
  "supported-first",
  "evenly-spaced",
  "random",
] as const;

export type ExpansionBatchPlanSelectionStrategy =
  (typeof EXPANSION_BATCH_PLAN_SELECTION_STRATEGIES)[number];

export const DEFAULT_EXPANSION_BATCH_PLAN_SELECTION_STRATEGY: ExpansionBatchPlanSelectionStrategy =
  "research-value";

export const EXPANSION_BATCH_PLAN_FILENAME = "expansion-batch-plan.json";
export const DEFAULT_EXPANSION_BATCH_PLAN_OUTPUT_PATH =
  "data/research-results/expansion-batch-plan.json";
export const DEFAULT_EXPANSION_BATCH_PLAN_HTML_PATH =
  "data/reports/expansion-batch-plan.html";

export const DEFAULT_EXPANSION_BATCH_PLAN_COVERAGE_PLAN_PATH =
  "data/research-results/historical-coverage-plan.json";
export const DEFAULT_EXPANSION_BATCH_PLAN_EXPANSION_CONFIG_PATH =
  "data/import-configs/historical-expansion-config.json";
export const DEFAULT_EXPANSION_BATCH_PLAN_EXPANSION_IMPORT_SUMMARY_PATH =
  "data/research-results/historical-expansion-import-summary.json";
export const DEFAULT_EXPANSION_BATCH_PLAN_HYPOTHESIS_VALIDATION_PATH =
  "data/research-results/hypothesis-validation.json";
export const DEFAULT_EXPANSION_BATCH_PLAN_COVERAGE_AWARE_VALIDATION_PATH =
  "data/research-results/coverage-aware-validation.json";
export const DEFAULT_EXPANSION_BATCH_PLAN_DISCOVERY_RESULT_PATH = "discovery-result.json";

export const ExpansionBatchPlannerErrorCode = {
  MISSING_INPUT: "missing-input",
  INVALID_JSON: "invalid-json",
  INVALID_DOCUMENT: "invalid-document",
  INVALID_BUDGET: "invalid-budget",
} as const;

export type ExpansionBatchPlannerErrorCode =
  (typeof ExpansionBatchPlannerErrorCode)[keyof typeof ExpansionBatchPlannerErrorCode];

export class ExpansionBatchPlannerError extends Error {
  readonly code: ExpansionBatchPlannerErrorCode;

  constructor(message: string, code: ExpansionBatchPlannerErrorCode) {
    super(message);
    this.name = "ExpansionBatchPlannerError";
    this.code = code;
  }
}

export type ExpansionBatchPlannerInputPaths = {
  coveragePlanPath: string;
  expansionConfigPath: string;
  expansionImportSummaryPath: string;
  hypothesisValidationPath: string;
  coverageAwareValidationPath: string;
  discoveryResultPath: string;
};

export type ExpansionBatchPlannerInputStatus = {
  coveragePlanPresent: boolean;
  expansionConfigPresent: boolean;
  expansionImportSummaryPresent: boolean;
  hypothesisValidationPresent: boolean;
  coverageAwareValidationPresent: boolean;
  discoveryResultPresent: boolean;
};

export type ExpansionBatchMonthCandidate = {
  month: string;
  seriesTicker: string;
  coverageStatus: CoverageDepthStatus;
  targetHypothesisIds: readonly string[];
  expectedValidationBenefit: string;
  expectedImportability: EstimatedSupportLevel;
  estimatedUnsupportedRate: number;
  currentObservations: number;
  currentMarketCount: number;
  desiredObservations: number;
  discoveryAvailableCount: number | null;
  recommendationPriority: number;
  thinHypothesisCount: number;
  coverageAwareBoost: number;
};

export type ScoredExpansionBatchMonthCandidate = ExpansionBatchMonthCandidate & {
  score: number;
  scoreRationale: string;
};

export type ExpansionBatchAllocation = {
  allocationId: string;
  month: string;
  seriesTicker: string;
  marketCount: number;
  rationale: string;
  targetHypothesisIds: readonly string[];
  expectedValidationBenefit: string;
  expectedImportability: EstimatedSupportLevel;
  estimatedUnsupportedRate: number;
  currentObservations: number;
  currentMarketCount: number;
  desiredObservations: number;
  discoveryAvailableCount: number | null;
  riskNotes: readonly string[];
  priorityScore: number;
};

export type ExpansionBatchPlanSummary = {
  totalAllocatedMarkets: number;
  allocationCount: number;
  scheduledJobCount: number;
  candidateMonthCount: number;
  unsupportedHeavyAllocationCount: number;
};

export type ExpansionBatchPlan = {
  generatedAt: string;
  outputPath: string;
  htmlOutputPath: string;
  maxMarkets: number;
  selectionStrategy: ExpansionBatchPlanSelectionStrategy;
  selectionSeed: string;
  inputPaths: ExpansionBatchPlannerInputPaths;
  inputStatus: ExpansionBatchPlannerInputStatus;
  summary: ExpansionBatchPlanSummary;
  plannerNotes: readonly string[];
  allocations: readonly ExpansionBatchAllocation[];
};

export type ExpansionBatchPlannerConfig = {
  outputPath: string;
  htmlOutputPath: string;
  maxMarkets: number;
  selectionStrategy: ExpansionBatchPlanSelectionStrategy;
  selectionSeed: string;
  inputPaths: ExpansionBatchPlannerInputPaths;
};

export type ExpansionBatchPlannerIo = {
  readFile: (path: string) => string;
  fileExists: (path: string) => boolean;
};

export type BuildExpansionBatchPlanInput = {
  generatedAt: string;
  config: ExpansionBatchPlannerConfig;
  io: ExpansionBatchPlannerIo;
};
