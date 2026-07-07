import type { StrategyPromotionStatus } from "@/lib/data/research/strategySynthesis/strategySynthesisTypes";

export const STRATEGY_SYNTHESIS_DEBUG_FILENAME = "strategy-synthesis-debug.json";
export const DEFAULT_STRATEGY_SYNTHESIS_DEBUG_OUTPUT_PATH =
  "data/research-results/strategy-synthesis-debug.json";
export const DEFAULT_STRATEGY_SYNTHESIS_DEBUG_HTML_PATH =
  "data/reports/strategy-synthesis-debug.html";

export const DEFAULT_STRATEGY_SYNTHESIS_DEBUG_HYPOTHESIS_CANDIDATES_PATH =
  "data/research-results/hypothesis-candidates.json";
export const DEFAULT_STRATEGY_SYNTHESIS_DEBUG_HYPOTHESIS_VALIDATION_PATH =
  "data/research-results/hypothesis-validation.json";
export const DEFAULT_STRATEGY_SYNTHESIS_DEBUG_SYNTHESIS_PATH =
  "data/research-results/strategy-synthesis-candidates.json";
export const DEFAULT_STRATEGY_SYNTHESIS_DEBUG_HARNESS_SUMMARY_PATH =
  "data/research-results/harness/strategy-harness-summary.json";
export const DEFAULT_STRATEGY_SYNTHESIS_DEBUG_HARNESS_RESULTS_PATH =
  "data/research-results/harness-results.json";

export const StrategySynthesisDebugErrorCode = {
  MISSING_INPUT: "missing-input",
  INVALID_JSON: "invalid-json",
  INVALID_DOCUMENT: "invalid-document",
} as const;

export type StrategySynthesisDebugErrorCode =
  (typeof StrategySynthesisDebugErrorCode)[keyof typeof StrategySynthesisDebugErrorCode];

export class StrategySynthesisDebugError extends Error {
  readonly code: StrategySynthesisDebugErrorCode;

  constructor(message: string, code: StrategySynthesisDebugErrorCode) {
    super(message);
    this.name = "StrategySynthesisDebugError";
    this.code = code;
  }
}

export const STRATEGY_SYNTHESIS_REJECTION_CATEGORIES = [
  "not-synthesized",
  "empty-candidate-file",
  "missing-validation",
  "insufficient-validation-score",
  "validation-failed",
  "promotion-rejected",
  "unsupported-strategy-family",
  "missing-entry-threshold",
  "unsupported-entry-exit-condition",
  "harness-schema-mismatch",
  "threshold-mismatch",
  "harness-filter-excluded",
] as const;

export type StrategySynthesisRejectionCategory =
  (typeof STRATEGY_SYNTHESIS_REJECTION_CATEGORIES)[number];

export type StrategySynthesisFunnelStage =
  | "hypothesis-candidate"
  | "synthesis-candidate"
  | "harness-eligible"
  | "harness-evaluated";

export type StrategySynthesisDebugInputPaths = {
  hypothesisCandidatesPath: string;
  hypothesisValidationPath: string;
  strategySynthesisPath: string;
  harnessSummaryPath: string;
  harnessResultsPath: string;
};

export type StrategySynthesisDebugInputStatus = {
  hypothesisCandidatesPresent: boolean;
  hypothesisValidationPresent: boolean;
  strategySynthesisPresent: boolean;
  harnessSummaryPresent: boolean;
  harnessResultsPresent: boolean;
};

export type StrategySynthesisFunnelCounts = {
  hypothesisCandidates: number;
  synthesisCandidates: number;
  harnessEligible: number;
  harnessEvaluated: number;
  evaluatedStrategies: number;
};

export type StrategySynthesisDiagnosis =
  | "expected-validation-failure"
  | "unsupported-family-bridge-gap"
  | "empty-inputs"
  | "schema-mismatch"
  | "mixed"
  | "healthy";

export type StrategySynthesisHypothesisTrace = {
  hypothesisId: string;
  hypothesisCandidatePresent: boolean;
  synthesisCandidatePresent: boolean;
  strategyId: string | null;
  strategyFamily: string | null;
  promotionStatus: StrategyPromotionStatus | null;
  validationPasses: boolean | null;
  robustnessScore: number | null;
  confidence: string | null;
  harnessEligible: boolean;
  harnessEvaluated: boolean;
  harnessRunCount: number;
  funnelStageReached: StrategySynthesisFunnelStage | "blocked";
  rejectionReasons: readonly string[];
  rejectionCategories: readonly StrategySynthesisRejectionCategory[];
  missingFields: readonly string[];
  validationReasons: readonly string[];
};

export type StrategySynthesisDebugSummary = {
  funnel: StrategySynthesisFunnelCounts;
  diagnosis: StrategySynthesisDiagnosis;
  diagnosisRationale: string;
  recommendedNextTask: string;
  emptyCandidateFileReasons: readonly string[];
  harnessWarnings: readonly string[];
  rejectionCategoryCounts: Record<StrategySynthesisRejectionCategory, number>;
  promotionCounts: {
    experimental: number;
    candidate: number;
    rejected: number;
  };
  nearPromisingCount: number;
};

export type StrategySynthesisDebugReport = {
  generatedAt: string;
  outputPath: string;
  htmlOutputPath: string;
  inputPaths: StrategySynthesisDebugInputPaths;
  inputStatus: StrategySynthesisDebugInputStatus;
  summary: StrategySynthesisDebugSummary;
  traces: readonly StrategySynthesisHypothesisTrace[];
  investigatorNotes: readonly string[];
};

export type StrategySynthesisDebugIo = {
  readFile: (path: string) => string;
  fileExists: (path: string) => boolean;
};

export type BuildStrategySynthesisDebugReportInput = {
  generatedAt: string;
  outputPath: string;
  htmlOutputPath: string;
  inputPaths: StrategySynthesisDebugInputPaths;
  io: StrategySynthesisDebugIo;
  nearPromisingScoreFloor?: number;
};
