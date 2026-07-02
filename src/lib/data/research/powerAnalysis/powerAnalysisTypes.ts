export const DEFAULT_POWER_ANALYSIS_INPUT_DIR = "data/research-results";
export const DEFAULT_POWER_ANALYSIS_OUTPUT_PATH =
  "data/research-results/power-analysis.json";
export const POWER_ANALYSIS_FILENAME = "power-analysis.json";

export const DEFAULT_POWER_ANALYSIS_ALPHA = 0.05;
export const DEFAULT_POWER_ANALYSIS_LEVELS = [0.8, 0.9, 0.95] as const;
export const DEFAULT_TARGET_EDGE_CENTS = [1, 2, 5, 10] as const;

export const PowerAnalysisErrorCode = {
  MISSING_INPUT_DIRECTORY: "missing-input-directory",
  EMPTY_DATASET: "empty-dataset",
  INVALID_AGGREGATE_SUMMARY: "invalid-aggregate-summary",
} as const;

export type PowerAnalysisErrorCode =
  (typeof PowerAnalysisErrorCode)[keyof typeof PowerAnalysisErrorCode];

export class PowerAnalysisError extends Error {
  readonly code: PowerAnalysisErrorCode;
  readonly strategyId?: string;

  constructor(message: string, code: PowerAnalysisErrorCode, strategyId?: string) {
    super(message);
    this.name = "PowerAnalysisError";
    this.code = code;
    this.strategyId = strategyId;
  }
}

export type PowerAnalysisConfidenceInterval95 = {
  lower: number;
  upper: number;
};

export type RequiredSampleSizeByEdgeCents = {
  edgeCents: number;
  requiredSampleSize: number | null;
};

export type PowerTableRow = {
  targetPower: number;
  alpha: number;
  minimumDetectableEffectCents: number | null;
  requiredSampleSizeByEdgeCents: readonly RequiredSampleSizeByEdgeCents[];
};

export type StrategyPowerAnalysis = {
  strategyId: string;
  sampleSize: number;
  observedMeanPnlCents: number | null;
  observedVariance: number | null;
  observedStandardDeviation: number | null;
  observedEffectSize: number | null;
  confidenceInterval95: PowerAnalysisConfidenceInterval95 | null;
  currentPowerAtObservedEffect: number | null;
  estimatedMarketsRequiredForObservedEffect: number | null;
  underpowered: boolean;
  powerTable: readonly PowerTableRow[];
  sourcePaths: readonly string[];
  warnings: readonly string[];
};

export type PowerAnalysisOverallSummary = {
  strategyCount: number;
  totalCompletedMarkets: number;
  underpoweredStrategyCount: number;
  medianRequiredSampleSizeFor2CentEdge: number | null;
};

export type PowerAnalysisReport = {
  generatedAt: string;
  inputRoot: string;
  outputPath: string;
  alpha: number;
  targetPowerLevels: readonly number[];
  targetEdgeCents: readonly number[];
  overallSummary: PowerAnalysisOverallSummary;
  strategies: readonly StrategyPowerAnalysis[];
  recommendations: readonly string[];
};

export type PowerAnalysisIo = {
  readdir: (path: string) => readonly string[];
  readFile: (path: string) => string;
  fileExists: (path: string) => boolean;
  isDirectory: (path: string) => boolean;
};

export type BuildPowerAnalysisReportInput = {
  inputRoot: string;
  outputPath: string;
  generatedAt: string;
  alpha?: number;
  targetPowerLevels?: readonly number[];
  targetEdgeCents?: readonly number[];
  summaries: readonly import("../leaderboard/strategyLeaderboardTypes").ParsedStrategyAggregateSummary[];
};

export type CompletedMarketPnlSample = {
  marketTicker: string;
  totalPnlCents: number;
};
