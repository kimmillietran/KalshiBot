import type { HypothesisCandidate } from "@/lib/data/research/hypothesisCandidates/hypothesisCandidateTypes";
import type {
  MispricingObservation,
  RegimeVolatilityByMarketKey,
} from "@/lib/data/research/mispricingAtlas/mispricingAtlasTypes";

import type { HypothesisValidationMemoryDiagnostics } from "./hypothesisValidationMemoryTypes";

export const HYPOTHESIS_VALIDATION_FILENAME = "hypothesis-validation.json";
export const DEFAULT_HYPOTHESIS_VALIDATION_OUTPUT_PATH =
  "data/research-results/hypothesis-validation.json";
export const DEFAULT_HYPOTHESIS_VALIDATION_HTML_PATH =
  "data/reports/research-hypothesis-validation.html";

export const DEFAULT_HYPOTHESIS_VALIDATION_PASS_SCORE = 70;
export const DEFAULT_SINGLE_DAY_CONCENTRATION_FLAG = 0.5;
export const DEFAULT_MIN_PERIOD_OBSERVATIONS = 3;

export type VolatilityRegimeTag = "low" | "medium" | "high";

export type EnrichedMispricingObservation = MispricingObservation & {
  timestampMs: number | null;
  tradingDayUtc: string | null;
  calendarMonth: string | null;
  calendarQuarter: string | null;
  volatilityRegime: VolatilityRegimeTag | null;
};

export type ParsedAtlasHypothesisRef = {
  groupId:
    | "probabilityOnly"
    | "probabilityTime"
    | "probabilityRegime"
    | "probabilityMoneyness"
    | "moneynessTime"
    | "volatilityMoneyness"
    | "volatilityProbabilityTime"
    | "probabilityMomentumTime"
    | "probabilityMomentum"
    | "momentumVolatility"
    | "momentumTime"
    | "momentum"
    | "probability"
    | "timeRemaining"
    | "moneyness"
    | "volatility";
  bucketId: string;
  direction: "over" | "under";
};

export type PeriodCalibrationMetric = {
  periodKey: string;
  observations: number;
  signedCalibrationError: number | null;
  edgeMatchesDirection: boolean;
};

export type HypothesisTimeStabilityMetrics = {
  monthPeriods: readonly PeriodCalibrationMetric[];
  quarterPeriods: readonly PeriodCalibrationMetric[];
  monthPersistenceRate: number;
  quarterPersistenceRate: number;
  scoreComponent: number;
};

export type RegimeCalibrationMetric = {
  regime: VolatilityRegimeTag;
  observations: number;
  signedCalibrationError: number | null;
  edgeMatchesDirection: boolean;
};

export type HypothesisRegimeStabilityMetrics = {
  regimes: readonly RegimeCalibrationMetric[];
  regimesWithEdge: number;
  regimesWithData: number;
  scoreComponent: number;
};

export type HypothesisSampleConcentrationMetrics = {
  uniqueTradingDays: number;
  largestContributingDay: string | null;
  largestDayObservations: number;
  largestDayPercent: number;
  singleDayDominated: boolean;
  scoreComponent: number;
};

export type LeaveOnePeriodOutFold = {
  excludedMonth: string;
  remainingObservations: number;
  signedCalibrationError: number | null;
};

export type HypothesisLeaveOnePeriodOutMetrics = {
  folds: readonly LeaveOnePeriodOutFold[];
  errorVariance: number;
  errorStdDev: number;
  scoreComponent: number;
};

export type HypothesisValidationEntry = {
  hypothesisId: string;
  hypothesis: string;
  sourceArtifact: string;
  robustnessScore: number;
  passes: boolean;
  reasons: readonly string[];
  observationCount: number;
  timeStability: HypothesisTimeStabilityMetrics;
  regimeStability: HypothesisRegimeStabilityMetrics;
  sampleConcentration: HypothesisSampleConcentrationMetrics;
  leaveOnePeriodOut: HypothesisLeaveOnePeriodOutMetrics;
};

export type HypothesisValidationSummary = {
  totalHypotheses: number;
  passingCount: number;
  failingCount: number;
  averageRobustnessScore: number;
};

export type HypothesisValidationConfig = {
  passScoreThreshold: number;
  minCalibrationError: number;
  singleDayConcentrationFlag: number;
  minPeriodObservations: number;
};

export type HypothesisValidationInputPaths = {
  hypothesisCandidatesPath: string;
  mispricingAtlasPath: string;
  researchResultsDir: string;
  regimeTagsPath: string;
};

export type HypothesisValidationReport = {
  generatedAt: string;
  outputPath: string;
  htmlOutputPath: string;
  inputPaths: HypothesisValidationInputPaths;
  config: HypothesisValidationConfig;
  summary: HypothesisValidationSummary;
  validations: readonly HypothesisValidationEntry[];
  memoryDiagnostics?: HypothesisValidationMemoryDiagnostics;
};

export type BuildHypothesisValidationReportInput = {
  generatedAt: string;
  outputPath: string;
  htmlOutputPath: string;
  inputPaths: HypothesisValidationInputPaths;
  candidates: readonly HypothesisCandidate[];
  observations: readonly EnrichedMispricingObservation[];
  regimeVolatilityByMarket: RegimeVolatilityByMarketKey;
  config?: Partial<HypothesisValidationConfig>;
};

export type HypothesisRobustnessIo = {
  readFile: (path: string) => string;
  fileExists: (path: string) => boolean;
  readdir: (path: string) => readonly string[];
  isDirectory: (path: string) => boolean;
};

export class HypothesisRobustnessError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HypothesisRobustnessError";
  }
}
