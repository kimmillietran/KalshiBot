export const MISPRICING_ATLAS_FILENAME = "mispricing-atlas.json";
export const DEFAULT_MISPRICING_ATLAS_INPUT_DIR = "data/research-results";
export const DEFAULT_MISPRICING_ATLAS_OUTPUT_PATH =
  "data/research-results/mispricing-atlas.json";

export const DEFAULT_MISPRICING_VOLATILITY_LOOKBACK_BARS = 10;

export const MispricingAtlasErrorCode = {
  INVALID_JSON: "invalid-json",
  INVALID_DOCUMENT: "invalid-document",
  MISSING_INPUT_DIRECTORY: "missing-input-directory",
} as const;

export type MispricingAtlasErrorCode =
  (typeof MispricingAtlasErrorCode)[keyof typeof MispricingAtlasErrorCode];

export class MispricingAtlasError extends Error {
  readonly code: MispricingAtlasErrorCode;

  constructor(message: string, code: MispricingAtlasErrorCode) {
    super(message);
    this.name = "MispricingAtlasError";
    this.code = code;
  }
}

export type MispricingObservation = {
  strategyId: string;
  seriesTicker: string;
  marketTicker: string;
  outputPath: string;
  stepIndex: number;
  predictedProbability: number;
  observedOutcome: 0 | 1;
  timeRemainingMs: number | null;
  moneynessPercent: number | null;
  annualizedVolatility: number | null;
};

export type MispricingAtlasBucketSummary = {
  bucketId: string;
  bucketLabel: string;
  observations: number;
  averageImpliedProbability: number | null;
  realizedFrequency: number | null;
  calibrationError: number | null;
  brierScore: number | null;
  averageAbsoluteError: number | null;
};

export type MispricingAtlasSampleCounts = {
  totalObservations: number;
  marketCount: number;
  skippedMissingSettlement: number;
  skippedMissingProbability: number;
  skippedMissingContext: number;
};

export type MispricingAtlasWarning = {
  code: "missing-settlement" | "missing-probability" | "missing-context";
  message: string;
  marketTicker?: string;
};

export type MispricingAtlas = {
  generatedAt: string;
  inputRoot: string;
  outputPath: string;
  sampleCounts: MispricingAtlasSampleCounts;
  overallCalibration: MispricingAtlasBucketSummary;
  probabilityBuckets: readonly MispricingAtlasBucketSummary[];
  timeRemainingBuckets: readonly MispricingAtlasBucketSummary[];
  moneynessBuckets: readonly MispricingAtlasBucketSummary[];
  volatilityBuckets: readonly MispricingAtlasBucketSummary[];
  warnings: readonly MispricingAtlasWarning[];
};

export type BuildMispricingAtlasInput = {
  inputRoot: string;
  outputPath: string;
  generatedAt: string;
  scanned: readonly import("@/lib/data/research/calibration/calibrationTypes").ScannedCalibrationResearchOutput[];
};

export type MispricingAtlasIo = {
  readdir: (path: string) => readonly string[];
  readFile: (path: string) => string;
  fileExists: (path: string) => boolean;
  isDirectory: (path: string) => boolean;
};
