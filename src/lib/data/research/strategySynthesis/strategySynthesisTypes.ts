import type { HypothesisCandidatesReport } from "@/lib/data/research/hypothesisCandidates/hypothesisCandidateTypes";

export const STRATEGY_SYNTHESIS_CANDIDATES_FILENAME =
  "strategy-synthesis-candidates.json";
export const DEFAULT_STRATEGY_SYNTHESIS_OUTPUT_PATH =
  "data/research-results/strategy-synthesis-candidates.json";
export const DEFAULT_HYPOTHESIS_VALIDATION_INPUT_PATH =
  "data/research-results/hypothesis-validation.json";

export const DEFAULT_CANDIDATE_PROMOTION_SCORE_THRESHOLD = 80;

export const StrategySynthesisErrorCode = {
  INVALID_JSON: "invalid-json",
  INVALID_DOCUMENT: "invalid-document",
  MISSING_INPUT: "missing-input",
} as const;

export type StrategySynthesisErrorCode =
  (typeof StrategySynthesisErrorCode)[keyof typeof StrategySynthesisErrorCode];

export class StrategySynthesisError extends Error {
  readonly code: StrategySynthesisErrorCode;

  constructor(message: string, code: StrategySynthesisErrorCode) {
    super(message);
    this.name = "StrategySynthesisError";
    this.code = code;
  }
}

export type StrategySynthesisDirection =
  | "buy-yes"
  | "buy-no"
  | "fade-yes"
  | "fade-no";

export type StrategyPromotionStatus =
  | "experimental"
  | "candidate"
  | "rejected";

export type StrategySynthesisEntryConditions = {
  summary: string;
  marketCondition: string;
  atlasGroupId: string | null;
  bucketId: string | null;
  calibrationDirection: "over" | "under" | null;
  minCalibrationError: number | null;
  leadLagCandles: number | null;
};

export type StrategySynthesisValidationSummary = {
  robustnessScore: number | null;
  passes: boolean;
  observationCount: number | null;
  reasons: readonly string[];
  summary: string;
};

export type StrategySynthesisCandidate = {
  strategyId: string;
  hypothesisId: string;
  strategyFamily: string;
  direction: StrategySynthesisDirection;
  entryConditions: StrategySynthesisEntryConditions;
  exitAssumption: string;
  requiredData: readonly string[];
  riskNotes: readonly string[];
  validationSummary: StrategySynthesisValidationSummary;
  promotionStatus: StrategyPromotionStatus;
};

export type StrategySynthesisConfig = {
  candidatePromotionScoreThreshold: number;
};

export type StrategySynthesisInputPaths = {
  hypothesisCandidatesPath: string;
  hypothesisValidationPath: string;
};

export type StrategySynthesisSummary = {
  totalCandidates: number;
  synthesizedCount: number;
  promotionCounts: {
    experimental: number;
    candidate: number;
    rejected: number;
  };
  skipReasons: readonly string[];
};

export type StrategySynthesisCandidatesReport = {
  generatedAt: string;
  outputPath: string;
  inputPaths: StrategySynthesisInputPaths;
  config: StrategySynthesisConfig;
  summary: StrategySynthesisSummary;
  strategies: readonly StrategySynthesisCandidate[];
};

export type ParsedHypothesisValidationEntry = {
  hypothesisId: string;
  robustnessScore: number;
  passes: boolean;
  reasons: readonly string[];
  observationCount: number;
};

export type ParsedHypothesisValidationReport = {
  generatedAt: string;
  outputPath: string;
  validations: readonly ParsedHypothesisValidationEntry[];
};

export type ParsedStrategySynthesisInputs = {
  candidatesReport: HypothesisCandidatesReport;
  validationReport: ParsedHypothesisValidationReport;
};

export type BuildStrategySynthesisReportInput = {
  generatedAt: string;
  outputPath: string;
  inputPaths: StrategySynthesisInputPaths;
  inputs: ParsedStrategySynthesisInputs;
  config?: Partial<StrategySynthesisConfig>;
};

export type StrategySynthesisIo = {
  readFile: (path: string) => string;
  fileExists: (path: string) => boolean;
};
