import type { HypothesisCandidate } from "@/lib/data/research/hypothesisCandidates/hypothesisCandidateTypes";
import type { HypothesisValidationEntry } from "@/lib/data/research/hypothesisRobustness/hypothesisRobustnessTypes";
import type { CrossValidationEntry } from "@/lib/data/research/crossValidation/crossValidationTypes";

export const COVERAGE_AWARE_VALIDATION_FILENAME = "coverage-aware-validation.json";
export const DEFAULT_COVERAGE_AWARE_VALIDATION_OUTPUT_PATH =
  "data/research-results/coverage-aware-validation.json";
export const DEFAULT_COVERAGE_AWARE_VALIDATION_HTML_PATH =
  "data/reports/coverage-aware-validation.html";

export const DEFAULT_HISTORICAL_COVERAGE_PLAN_PATH =
  "data/research-results/historical-coverage-plan.json";

export const DEFAULT_MIN_MONTHS_FOR_JUDGMENT = 3;
export const DEFAULT_MIN_TRADING_DAYS_FOR_JUDGMENT = 8;
export const DEFAULT_MIN_OBSERVATIONS_FOR_JUDGMENT = 6;
export const DEFAULT_MIN_REGIMES_FOR_JUDGMENT = 2;
export const DEFAULT_PROMISING_ROBUSTNESS_FLOOR = 50;

export type CoverageAwareValidationClassification =
  | "rejected"
  | "inconclusive-insufficient-coverage"
  | "inconclusive-regime-sparse"
  | "promising-needs-more-history"
  | "robust-enough-to-test";

export type CoverageAwareRegimeCoverage = {
  regimesWithData: number;
  regimesWithEdge: number;
  sparseRegimes: readonly string[];
};

export type RecommendedImportWindow = {
  windowId: string;
  label: string;
  startDate: string;
  endDate: string;
  rationale: string;
  priority: "high" | "medium" | "low";
};

export type CoverageAwareValidationMetrics = {
  observationCount: number;
  uniqueTradingDays: number;
  monthCount: number;
  regimeCoverage: CoverageAwareRegimeCoverage;
  robustnessScore: number;
  largestDayPercent: number;
  singleDayDominated: boolean;
  crossValidationPasses: boolean | null;
};

export type CoverageAwareValidationEntry = {
  hypothesisId: string;
  hypothesis: string;
  sourceArtifact: string;
  classification: CoverageAwareValidationClassification;
  metrics: CoverageAwareValidationMetrics;
  missingCoverageExplanation: string;
  recommendedImportWindows: readonly RecommendedImportWindow[];
  advisoryNotes: readonly string[];
};

export type CoverageAwareValidationThresholds = {
  minMonths: number;
  minTradingDays: number;
  minObservations: number;
  minRegimesWithData: number;
  minRobustnessScore: number;
  promisingRobustnessFloor: number;
};

export type HistoricalCoveragePlan = {
  thresholds: CoverageAwareValidationThresholds;
  currentCoverage: {
    earliestTradingDayUtc: string | null;
    latestTradingDayUtc: string | null;
    uniqueTradingDays: number;
    uniqueMonths: number;
  };
  recommendedImportWindows: readonly RecommendedImportWindow[];
};

export type CoverageAwareValidationSummary = {
  totalHypotheses: number;
  rejectedCount: number;
  inconclusiveInsufficientCoverageCount: number;
  inconclusiveRegimeSparseCount: number;
  promisingNeedsMoreHistoryCount: number;
  robustEnoughToTestCount: number;
};

export type CoverageAwareValidationInputPaths = {
  hypothesisValidationPath: string;
  crossValidationPath: string;
  historicalCoveragePlanPath: string;
  hypothesisCandidatesPath: string;
};

export type CoverageAwareValidationReport = {
  generatedAt: string;
  outputPath: string;
  htmlOutputPath: string;
  inputPaths: CoverageAwareValidationInputPaths;
  thresholds: CoverageAwareValidationThresholds;
  summary: CoverageAwareValidationSummary;
  entries: readonly CoverageAwareValidationEntry[];
};

export type ParsedCoverageAwareValidationInputs = {
  candidates: readonly HypothesisCandidate[];
  validations: readonly HypothesisValidationEntry[];
  crossValidationEntries: readonly CrossValidationEntry[];
  coveragePlan: HistoricalCoveragePlan | null;
};

export type BuildCoverageAwareValidationReportInput = {
  generatedAt: string;
  outputPath: string;
  htmlOutputPath: string;
  inputPaths: CoverageAwareValidationInputPaths;
  candidates: readonly HypothesisCandidate[];
  validations: readonly HypothesisValidationEntry[];
  crossValidationEntries: readonly CrossValidationEntry[];
  coveragePlan: HistoricalCoveragePlan | null;
};

export type CoverageAwareValidationIo = {
  readFile: (path: string) => string;
  fileExists: (path: string) => boolean;
};

export class CoverageAwareValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CoverageAwareValidationError";
  }
}
