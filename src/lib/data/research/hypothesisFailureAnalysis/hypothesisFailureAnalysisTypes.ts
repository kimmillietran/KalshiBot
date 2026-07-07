import type { HypothesisCandidate } from "@/lib/data/research/hypothesisCandidates/hypothesisCandidateTypes";
import type { CoverageAwareValidationEntry } from "@/lib/data/research/coverageAwareValidation/coverageAwareValidationTypes";
import type { CrossValidationEntry } from "@/lib/data/research/crossValidation/crossValidationTypes";
import type { HypothesisValidationEntry } from "@/lib/data/research/hypothesisRobustness/hypothesisRobustnessTypes";
import type { MispricingAtlas } from "@/lib/data/research/mispricingAtlas/mispricingAtlasTypes";
import type { HypothesisHistoryDocument } from "@/lib/data/research/hypothesisEvolution/hypothesisEvolutionTypes";

export const HYPOTHESIS_FAILURE_ANALYSIS_FILENAME = "hypothesis-failure-analysis.json";
export const DEFAULT_HYPOTHESIS_FAILURE_ANALYSIS_OUTPUT_PATH =
  "data/research-results/hypothesis-failure-analysis.json";
export const DEFAULT_HYPOTHESIS_FAILURE_ANALYSIS_HTML_PATH =
  "data/reports/hypothesis-failure-analysis.html";

export const DEFAULT_NEAR_PROMISING_ROBUSTNESS_FLOOR = 50;
export const DEFAULT_NEAR_PROMISING_MAX_SCORE_GAP = 25;
export const DEFAULT_LIKELY_SPURIOUS_ROBUSTNESS_CEILING = 35;
export const DEFAULT_DERIVED_MONTH_DOMINANCE_THRESHOLD = 0.15;
export const DEFAULT_WEAK_MONTH_PERSISTENCE_THRESHOLD = 0.5;
export const DEFAULT_HIGH_LOO_STD_DEV_THRESHOLD = 0.05;
export const DEFAULT_MIN_TRADING_DAYS_FOR_JUDGMENT = 8;
export const DEFAULT_MIN_MONTHS_FOR_JUDGMENT = 3;

export const HYPOTHESIS_FAILURE_REASON_CATEGORIES = [
  "insufficient-observations",
  "insufficient-trading-days",
  "poor-month-stability",
  "poor-leave-one-period-out",
  "regime-instability",
  "sample-concentration",
  "derived-data-sensitivity",
  "weak-calibration-gap",
  "cross-validation-failure",
  "below-pass-threshold",
] as const;

export type HypothesisFailureReasonCategory =
  (typeof HYPOTHESIS_FAILURE_REASON_CATEGORIES)[number];

export const HYPOTHESIS_PRIORITY_CATEGORIES = [
  "near-promising",
  "needs-more-data",
  "likely-spurious",
  "blocked-by-coverage",
] as const;

export type HypothesisPriorityCategory =
  (typeof HYPOTHESIS_PRIORITY_CATEGORIES)[number];

export const HYPOTHESIS_RECOMMENDED_NEXT_ACTIONS = [
  "collect-more-data",
  "inspect-month-breakdown",
  "inspect-derived-data-sensitivity",
  "lower-priority",
  "retire-if-next-batch-fails",
  "strategy-synthesis-investigation",
] as const;

export type HypothesisRecommendedNextAction =
  (typeof HYPOTHESIS_RECOMMENDED_NEXT_ACTIONS)[number];

export type HypothesisFailureReason = {
  category: HypothesisFailureReasonCategory;
  summary: string;
  detail: string | null;
};

export type MonthStabilitySnapshot = {
  month: string;
  observations: number;
  edgeMatchesDirection: boolean;
  signedCalibrationError: number | null;
  observationShare: number;
};

export type HypothesisStabilityDiagnostics = {
  strongestMonths: readonly MonthStabilitySnapshot[];
  weakestMonths: readonly MonthStabilitySnapshot[];
  missingOrThinMonths: readonly string[];
  highConcentrationDays: readonly { day: string; observations: number; percent: number }[];
  signalBreadth: "broad" | "narrow" | "mixed";
  monthPersistenceRate: number;
  quarterPersistenceRate: number;
  uniqueTradingDays: number;
  monthCount: number;
  leaveOnePeriodOutStdDev: number;
  regimesWithData: number;
  regimesWithEdge: number;
};

export type HypothesisFailureAnalysisEntry = {
  hypothesisId: string;
  hypothesis: string;
  passes: boolean;
  robustnessScore: number;
  passThreshold: number;
  scoreGap: number;
  observationCount: number;
  uniqueTradingDays: number;
  priorityRank: number;
  priorityCategory: HypothesisPriorityCategory;
  priorityScore: number;
  recommendedNextAction: HypothesisRecommendedNextAction;
  failureReasons: readonly HypothesisFailureReason[];
  stabilityDiagnostics: HypothesisStabilityDiagnostics;
  marginalEvidenceNeeds: readonly string[];
  notes: readonly string[];
  suggestedStrategyFamily: string | null;
  coverageClassification: string | null;
  crossValidationPasses: boolean | null;
};

export type HypothesisFailureAnalysisSummary = {
  totalHypotheses: number;
  passingCount: number;
  failingCount: number;
  nearPromisingCount: number;
  highestRobustnessScore: number;
  recommendedNextActions: Record<HypothesisRecommendedNextAction, number>;
};

export type HypothesisFailureAnalysisInputPaths = {
  hypothesisCandidatesPath: string;
  hypothesisValidationPath: string;
  mispricingAtlasPath: string;
  coverageAwareValidationPath: string;
  crossValidationPath: string;
  hypothesisHistoryPath: string;
};

export type HypothesisFailureAnalysisInputStatus = {
  hypothesisCandidatesPresent: boolean;
  hypothesisValidationPresent: boolean;
  mispricingAtlasPresent: boolean;
  coverageAwareValidationPresent: boolean;
  crossValidationPresent: boolean;
  hypothesisHistoryPresent: boolean;
};

export type HypothesisFailureAnalysisReport = {
  generatedAt: string;
  outputPath: string;
  htmlOutputPath: string;
  inputPaths: HypothesisFailureAnalysisInputPaths;
  inputStatus: HypothesisFailureAnalysisInputStatus;
  passThreshold: number;
  summary: HypothesisFailureAnalysisSummary;
  analyses: readonly HypothesisFailureAnalysisEntry[];
};

export type ParsedHypothesisFailureAnalysisInputs = {
  candidates: readonly HypothesisCandidate[];
  validations: readonly HypothesisValidationEntry[];
  mispricingAtlas: MispricingAtlas | null;
  coverageEntries: readonly CoverageAwareValidationEntry[];
  crossValidationEntries: readonly CrossValidationEntry[];
  hypothesisHistory: HypothesisHistoryDocument | null;
};

export type BuildHypothesisFailureAnalysisReportInput = {
  generatedAt: string;
  outputPath: string;
  htmlOutputPath: string;
  inputPaths: HypothesisFailureAnalysisInputPaths;
  inputStatus: HypothesisFailureAnalysisInputStatus;
  passThreshold?: number;
  candidates: readonly HypothesisCandidate[];
  validations: readonly HypothesisValidationEntry[];
  mispricingAtlas: MispricingAtlas | null;
  coverageEntries: readonly CoverageAwareValidationEntry[];
  crossValidationEntries: readonly CrossValidationEntry[];
  hypothesisHistory: HypothesisHistoryDocument | null;
};

export type HypothesisFailureAnalysisIo = {
  readFile: (path: string) => string;
  fileExists: (path: string) => boolean;
};

export class HypothesisFailureAnalysisError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HypothesisFailureAnalysisError";
  }
}
