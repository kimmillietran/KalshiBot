export const CALIBRATION_REPORT_FILENAME = "calibration-report.json";
export const DEFAULT_CALIBRATION_INPUT_DIR = "data/research-results";
export const DEFAULT_CALIBRATION_OUTPUT_DIR = "data/research-results";
export const DEFAULT_CALIBRATION_BIN_COUNT = 10;

export const CalibrationErrorCode = {
  MISSING_INPUT_DIRECTORY: "missing-input-directory",
  EMPTY_DATASET: "empty-dataset",
  DUPLICATE_MARKET: "duplicate-market",
  INVALID_OUTPUT_SCHEMA: "invalid-output-schema",
  MISSING_SETTLEMENT: "missing-settlement",
  MISSING_PROBABILITY: "missing-probability",
} as const;

export type CalibrationErrorCode =
  (typeof CalibrationErrorCode)[keyof typeof CalibrationErrorCode];

export class CalibrationError extends Error {
  readonly code: CalibrationErrorCode;
  readonly marketTicker?: string;

  constructor(
    message: string,
    code: CalibrationErrorCode,
    marketTicker?: string,
  ) {
    super(message);
    this.name = "CalibrationError";
    this.code = code;
    this.marketTicker = marketTicker;
  }
}

export type CalibrationWarningCode =
  | typeof CalibrationErrorCode.MISSING_SETTLEMENT
  | typeof CalibrationErrorCode.MISSING_PROBABILITY;

export type CalibrationWarning = {
  code: CalibrationWarningCode;
  message: string;
  marketTicker?: string;
};

export type CalibrationProbabilitySource =
  | "kalshi-implied"
  | "strategy-fair-value";

export type CalibrationObservation = {
  source: CalibrationProbabilitySource;
  strategyId: string;
  seriesTicker: string;
  marketTicker: string;
  predictedProbability: number;
  observedOutcome: 0 | 1;
  outputPath: string;
};

export type CalibrationBin = {
  binIndex: number;
  binStart: number;
  binEnd: number;
  sampleCount: number;
  averagePredictedProbability: number | null;
  observedSettlementFrequency: number | null;
};

export type CalibrationReliabilityRow = {
  binIndex: number;
  binLabel: string;
  sampleCount: number;
  averagePredictedProbability: number | null;
  observedSettlementFrequency: number | null;
  calibrationGap: number | null;
};

export type CalibrationChannelMetrics = {
  source: CalibrationProbabilitySource;
  sampleCount: number;
  brierScore: number | null;
  logLoss: number | null;
  calibrationError: number | null;
  bins: readonly CalibrationBin[];
  reliabilityTable: readonly CalibrationReliabilityRow[];
};

export type CalibrationMarketSummary = {
  marketTicker: string;
  outputPath: string;
  settlementOutcome: 0 | 1 | null;
  kalshiImpliedSampleCount: number;
  strategyFairValueSampleCount: number;
  warnings: readonly CalibrationWarning[];
};

export type CalibrationSampleCounts = {
  totalObservations: number;
  marketCount: number;
  kalshiImpliedCount: number;
  strategyFairValueCount: number;
  skippedMissingSettlement: number;
  skippedMissingProbability: number;
};

export type ProbabilityCalibrationReport = {
  generatedAt: string;
  strategyId: string;
  seriesTicker: string;
  inputRoot: string;
  outputPath: string;
  sampleCounts: CalibrationSampleCounts;
  kalshiImplied: CalibrationChannelMetrics;
  strategyFairValue: CalibrationChannelMetrics | null;
  markets: readonly CalibrationMarketSummary[];
  warnings: readonly CalibrationWarning[];
};

export type ScannedCalibrationResearchOutput = {
  strategyId: string;
  seriesTicker: string;
  marketTicker: string;
  outputPath: string;
  outputJson: string;
};

export type CalibrationIo = {
  readdir: (path: string) => readonly string[];
  readFile: (path: string) => string;
  fileExists: (path: string) => boolean;
  isDirectory: (path: string) => boolean;
};

export type BuildProbabilityCalibrationReportInput = {
  inputRoot: string;
  outputRoot: string;
  generatedAt: string;
  binCount?: number;
  scanned: readonly ScannedCalibrationResearchOutput[];
};

export type ParsedCalibrationResearchDocument = {
  strategyId: string;
  seriesTicker: string;
  marketTicker: string;
  settlementOutcome: 0 | 1 | null;
  kalshiImpliedProbabilities: readonly number[];
  strategyFairValueProbabilities: readonly number[];
};
