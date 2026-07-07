import type { VolatilityRegimeTag } from "@/lib/data/research/hypothesisRobustness/hypothesisRobustnessTypes";

export const MONTH_REGIME_ANALYSIS_FILENAME = "month-regime-analysis.json";
export const DEFAULT_MONTH_REGIME_ANALYSIS_OUTPUT_PATH =
  "data/research-results/month-regime-analysis.json";
export const DEFAULT_MONTH_REGIME_ANALYSIS_HTML_PATH =
  "data/reports/month-regime-analysis.html";

export const DEFAULT_MONTH_REGIME_HYPOTHESIS_CANDIDATES_PATH =
  "data/research-results/hypothesis-candidates.json";
export const DEFAULT_MONTH_REGIME_HYPOTHESIS_VALIDATION_PATH =
  "data/research-results/hypothesis-validation.json";
export const DEFAULT_MONTH_REGIME_REGIME_TAGS_PATH =
  "data/research-results/regime-tags.json";
export const DEFAULT_MONTH_REGIME_RESEARCH_RESULTS_DIR = "data/research-results";

export const MonthRegimeAnalysisErrorCode = {
  MISSING_INPUT: "missing-input",
  INVALID_JSON: "invalid-json",
  INVALID_DOCUMENT: "invalid-document",
} as const;

export type MonthRegimeAnalysisErrorCode =
  (typeof MonthRegimeAnalysisErrorCode)[keyof typeof MonthRegimeAnalysisErrorCode];

export class MonthRegimeAnalysisError extends Error {
  readonly code: MonthRegimeAnalysisErrorCode;

  constructor(message: string, code: MonthRegimeAnalysisErrorCode) {
    super(message);
    this.name = "MonthRegimeAnalysisError";
    this.code = code;
  }
}

export type MonthRegimeConfidenceInterval = {
  lower: number;
  upper: number;
};

export type MonthStabilityMetric = {
  month: string;
  monthLabel: string;
  observations: number;
  averageImpliedProbability: number | null;
  realizedProbability: number | null;
  signedCalibrationError: number | null;
  calibrationErrorMagnitude: number | null;
  edgeDirection: "supports" | "reverses" | "neutral" | "insufficient-data";
  edgeMatchesDirection: boolean;
  confidenceInterval: MonthRegimeConfidenceInterval | null;
  qualifiesForPersistence: boolean;
};

export type RegimeStabilityMetric = {
  regime: VolatilityRegimeTag;
  observations: number;
  averageImpliedProbability: number | null;
  realizedProbability: number | null;
  signedCalibrationError: number | null;
  calibrationErrorMagnitude: number | null;
  edgeDirection: "supports" | "reverses" | "neutral" | "insufficient-data";
  edgeMatchesDirection: boolean;
  robustnessContribution: number;
  qualifiesForPersistence: boolean;
};

export type MonthRegimeHeatmapCell = {
  month: string;
  regime: VolatilityRegimeTag;
  observations: number;
  signedCalibrationError: number | null;
  edgeDirection: "supports" | "reverses" | "neutral" | "insufficient-data";
};

export type MonthRegimeStabilitySummary = {
  strongestMonth: string | null;
  weakestMonth: string | null;
  reversingMonths: readonly string[];
  persistentMonths: readonly string[];
  regimeAgreementScore: number;
  monthAgreementScore: number;
  instabilityIndex: number;
  monthPersistenceRate: number;
  regimesWithEdge: number;
  regimesWithData: number;
};

export type MonthRegimeHypothesisAnalysis = {
  hypothesisId: string;
  hypothesis: string;
  direction: "over" | "under";
  robustnessScore: number;
  passes: boolean;
  observationCount: number;
  months: readonly MonthStabilityMetric[];
  regimes: readonly RegimeStabilityMetric[];
  heatmap: readonly MonthRegimeHeatmapCell[];
  summary: MonthRegimeStabilitySummary;
  monthExplanation: string;
  regimeExplanation: string;
  combinedDiagnostic: string;
};

export type MonthRegimeAnalysisInputPaths = {
  hypothesisCandidatesPath: string;
  hypothesisValidationPath: string;
  regimeTagsPath: string;
  researchResultsDir: string;
};

export type MonthRegimeAnalysisInputStatus = {
  hypothesisCandidatesPresent: boolean;
  hypothesisValidationPresent: boolean;
  regimeTagsPresent: boolean;
};

export type MonthRegimeAnalysisSummary = {
  totalHypotheses: number;
  stableCount: number;
  unstableCount: number;
  averageInstabilityIndex: number;
  emptyInputReasons: readonly string[];
};

export type MonthRegimeAnalysisReport = {
  generatedAt: string;
  outputPath: string;
  htmlOutputPath: string;
  inputPaths: MonthRegimeAnalysisInputPaths;
  inputStatus: MonthRegimeAnalysisInputStatus;
  config: {
    minCalibrationError: number;
    minPeriodObservations: number;
  };
  summary: MonthRegimeAnalysisSummary;
  analyses: readonly MonthRegimeHypothesisAnalysis[];
  investigatorNotes: readonly string[];
};

export type MonthRegimeAnalysisIo = {
  readFile: (path: string) => string;
  fileExists: (path: string) => boolean;
  readdir: (path: string) => readonly string[];
  isDirectory: (path: string) => boolean;
};

export type BuildMonthRegimeAnalysisReportInput = {
  generatedAt: string;
  outputPath: string;
  htmlOutputPath: string;
  inputPaths: MonthRegimeAnalysisInputPaths;
  io: MonthRegimeAnalysisIo;
};
