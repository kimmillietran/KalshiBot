import type { HypothesisCandidate } from "@/lib/data/research/hypothesisCandidates/hypothesisCandidateTypes";
import type {
  EnrichedMispricingObservation,
  HypothesisRobustnessIo,
} from "@/lib/data/research/hypothesisRobustness/hypothesisRobustnessTypes";
import type { RegimeVolatilityByMarketKey } from "@/lib/data/research/mispricingAtlas/mispricingAtlasTypes";

export const CROSS_VALIDATION_FILENAME = "cross-validation.json";
export const DEFAULT_CROSS_VALIDATION_OUTPUT_PATH =
  "data/research-results/cross-validation.json";
export const DEFAULT_CROSS_VALIDATION_HTML_PATH =
  "data/reports/research-cross-validation.html";

export const DEFAULT_ROLLING_WINDOW_MONTHS = 2;
export const DEFAULT_BOOTSTRAP_ITERATIONS = 100;
export const DEFAULT_BOOTSTRAP_SEED = 42;
export const DEFAULT_MAX_ERROR_STD_DEV = 0.05;
export const DEFAULT_MIN_PERSISTENCE_RATE = 0.5;

export type CrossValidationMethodId =
  | "rollingWindow"
  | "expandingWindow"
  | "leaveOneMonthOut"
  | "leaveOneRegimeOut"
  | "randomBootstrap";

export const CROSS_VALIDATION_METHOD_IDS: readonly CrossValidationMethodId[] = [
  "rollingWindow",
  "expandingWindow",
  "leaveOneMonthOut",
  "leaveOneRegimeOut",
  "randomBootstrap",
];

export type CrossValidationTargetType = "hypothesis" | "synthesized-strategy";

export type CrossValidationStabilityMetrics = {
  errorStdDev: number;
  errorVariance: number;
  persistenceRate: number;
  coefficientOfVariation: number | null;
  qualifyingFoldCount: number;
  totalFoldCount: number;
};

export type CrossValidationFold = {
  foldKey: string;
  calibrationError: number | null;
  observationCount: number;
  passes: boolean;
};

export type CrossValidationMethodResult = {
  method: CrossValidationMethodId;
  folds: readonly CrossValidationFold[];
  calibrationError: number | null;
  variance: number;
  observationCount: number;
  passes: boolean;
  stabilityMetrics: CrossValidationStabilityMetrics;
};

export type HypothesisValidationReference = {
  robustnessScore: number;
  passes: boolean;
  leaveOnePeriodOutStdDev: number;
};

export type ParsedHypothesisValidationRecord = HypothesisValidationReference & {
  hypothesisId: string;
};

export type ParsedSynthesizedStrategyRecord = {
  strategyId: string;
  hypothesisId: string;
  strategyFamily: string;
};

export type CrossValidationEntry = {
  targetId: string;
  targetType: CrossValidationTargetType;
  hypothesisId: string;
  strategyId: string | null;
  strategyFamily: string | null;
  direction: "over" | "under" | null;
  observationCount: number;
  methods: Record<CrossValidationMethodId, CrossValidationMethodResult>;
  hypothesisValidationReference: HypothesisValidationReference | null;
  overallPasses: boolean;
};

export type CrossValidationConfig = {
  rollingWindowMonths: number;
  bootstrapIterations: number;
  bootstrapSeed: number;
  minPeriodObservations: number;
  minCalibrationError: number;
  maxErrorStdDev: number;
  minPersistenceRate: number;
};

export type CrossValidationInputPaths = {
  hypothesisCandidatesPath: string;
  hypothesisValidationPath: string;
  strategySynthesisPath: string;
  researchResultsDir: string;
  regimeTagsPath: string;
};

export type CrossValidationSummary = {
  totalTargets: number;
  hypothesisCount: number;
  synthesizedStrategyCount: number;
  passingCount: number;
  failingCount: number;
  methodPassRates: Record<CrossValidationMethodId, number>;
};

export type CrossValidationReport = {
  generatedAt: string;
  outputPath: string;
  htmlOutputPath: string;
  inputPaths: CrossValidationInputPaths;
  config: CrossValidationConfig;
  summary: CrossValidationSummary;
  entries: readonly CrossValidationEntry[];
};

export type BuildCrossValidationReportInput = {
  generatedAt: string;
  outputPath: string;
  htmlOutputPath: string;
  inputPaths: CrossValidationInputPaths;
  candidates: readonly HypothesisCandidate[];
  synthesizedStrategies: readonly ParsedSynthesizedStrategyRecord[];
  hypothesisValidations: readonly ParsedHypothesisValidationRecord[];
  observations: readonly EnrichedMispricingObservation[];
  regimeVolatilityByMarket: RegimeVolatilityByMarketKey;
  config?: Partial<CrossValidationConfig>;
};

export type CrossValidationIo = HypothesisRobustnessIo;

export class CrossValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CrossValidationError";
  }
}
