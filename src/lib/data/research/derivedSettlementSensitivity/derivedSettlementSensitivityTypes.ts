import type { HypothesisCandidate } from "@/lib/data/research/hypothesisCandidates/hypothesisCandidateTypes";
import type { HypothesisValidationEntry } from "@/lib/data/research/hypothesisRobustness/hypothesisRobustnessTypes";

export const DERIVED_SETTLEMENT_SENSITIVITY_FILENAME =
  "derived-settlement-sensitivity.json";
export const DEFAULT_DERIVED_SETTLEMENT_SENSITIVITY_OUTPUT_PATH =
  "data/research-results/derived-settlement-sensitivity.json";
export const DEFAULT_DERIVED_SETTLEMENT_SENSITIVITY_HTML_PATH =
  "data/reports/derived-settlement-sensitivity.html";

export const DEFAULT_ROBUST_ROBUSTNESS_DELTA_THRESHOLD = 5;
export const DEFAULT_MODERATE_ROBUSTNESS_DELTA_THRESHOLD = 10;
export const DEFAULT_HIGH_ROBUSTNESS_DELTA_THRESHOLD = 15;
export const DEFAULT_DOMINATED_DERIVED_SHARE_THRESHOLD = 0.5;

export const DERIVED_SENSITIVITY_RECOMMENDATIONS = [
  "robust",
  "moderately-sensitive",
  "highly-sensitive",
  "dominated-by-derived-data",
] as const;

export type DerivedSensitivityRecommendation =
  (typeof DERIVED_SENSITIVITY_RECOMMENDATIONS)[number];

export type DerivedSettlementSensitivityMetrics = {
  observationCount: number;
  derivedObservationCount: number;
  officialObservationCount: number;
  derivedObservationShare: number;
  robustnessScore: number;
  signedCalibrationError: number | null;
  passes: boolean;
};

export type DerivedSettlementSensitivityEntry = {
  hypothesisId: string;
  hypothesis: string;
  allObservations: DerivedSettlementSensitivityMetrics;
  officialOnlyObservations: DerivedSettlementSensitivityMetrics;
  deltaRobustness: number;
  deltaCalibration: number | null;
  recommendation: DerivedSensitivityRecommendation;
  notes: readonly string[];
};

export type DerivedSettlementSensitivitySummary = {
  totalHypotheses: number;
  hypothesesAffectedCount: number;
  largestRobustnessDrop: number;
  largestRobustnessDropHypothesisId: string | null;
  hypothesesBecomingStrongerCount: number;
  hypothesesBecomingWeakerCount: number;
  derivedMarketCount: number;
  recommendationCounts: Record<DerivedSensitivityRecommendation, number>;
};

export type DerivedSettlementSensitivityInputPaths = {
  hypothesisCandidatesPath: string;
  hypothesisValidationPath: string;
  researchResultsDir: string;
  regimeTagsPath: string;
};

export type DerivedSettlementSensitivityInputStatus = {
  hypothesisCandidatesPresent: boolean;
  hypothesisValidationPresent: boolean;
  researchResultsPresent: boolean;
  regimeTagsPresent: boolean;
};

export type DerivedSettlementSensitivityReport = {
  generatedAt: string;
  outputPath: string;
  htmlOutputPath: string;
  inputPaths: DerivedSettlementSensitivityInputPaths;
  inputStatus: DerivedSettlementSensitivityInputStatus;
  passThreshold: number;
  derivedMarketCount: number;
  summary: DerivedSettlementSensitivitySummary;
  entries: readonly DerivedSettlementSensitivityEntry[];
};

export type BuildDerivedSettlementSensitivityReportInput = {
  generatedAt: string;
  outputPath: string;
  htmlOutputPath: string;
  inputPaths: DerivedSettlementSensitivityInputPaths;
  inputStatus: DerivedSettlementSensitivityInputStatus;
  passThreshold: number;
  candidates: readonly HypothesisCandidate[];
  validations: readonly HypothesisValidationEntry[];
  derivedMarketKeys: ReadonlySet<string>;
  officialOnlyValidations: readonly HypothesisValidationEntry[];
  officialOnlyCalibrationByHypothesisId: ReadonlyMap<string, number | null>;
  allCalibrationByHypothesisId: ReadonlyMap<string, number | null>;
};

export type DerivedSettlementSensitivityIo = {
  readFile: (path: string) => string;
  fileExists: (path: string) => boolean;
  readdir: (path: string) => readonly string[];
  isDirectory: (path: string) => boolean;
};

export class DerivedSettlementSensitivityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DerivedSettlementSensitivityError";
  }
}
