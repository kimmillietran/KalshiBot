import type { ComputedResearchFeatures } from "./researchObservationFeaturesTypes";

export const MISPRICING_ATLAS_FILENAME = "mispricing-atlas.json";
export const DEFAULT_MISPRICING_ATLAS_INPUT_DIR = "data/research-results";
export const DEFAULT_MISPRICING_ATLAS_OUTPUT_PATH =
  "data/research-results/mispricing-atlas.json";

export const DEFAULT_MISPRICING_VOLATILITY_LOOKBACK_BARS = 10;
export const DEFAULT_MISPRICING_ATLAS_MIN_SAMPLE_THRESHOLD = 30;

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
  /** 15-minute BTC percent change at observation time; null when candle history is insufficient. */
  momentumPercent: number | null;
  /** UTC trading day (YYYY-MM-DD) when the observation timestamp is known. */
  tradingDayUtc?: string | null;
  /** UTC epoch milliseconds for clock-time temporal dimensions. */
  timestampMs?: number | null;
  /** Canonical computed feature bag; mirrors top-level context fields when present. */
  computedFeatures?: ComputedResearchFeatures;
};

export type { ComputedResearchFeatures, ResearchObservationFeatures } from "./researchObservationFeaturesTypes";

export type MispricingAtlasBucketSummary = {
  bucketId: string;
  bucketLabel: string;
  observations: number;
  uniqueTradingDays?: number | null;
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

export type MispricingAtlasSkipReasonCounts = {
  missingSettlement: number;
  missingProbability: number;
  missingContext: number;
};

export type MispricingAtlasTopBucketEntry = {
  bucketId: string;
  bucketLabel: string;
  dimension: string;
  observations: number;
};

export type MispricingAtlasCoverageDiagnostics = {
  totalAtlasObservations: number;
  totalBuckets: number;
  nonEmptyBuckets: number;
  bucketsBelowMinSampleThreshold: number;
  minSampleThreshold: number;
  largestBucketObservations: number;
  topBucketsBySampleSize: readonly MispricingAtlasTopBucketEntry[];
  skipReasons: MispricingAtlasSkipReasonCounts;
};

export type MispricingAtlasCoarseBuckets = {
  probabilityOnly: readonly MispricingAtlasBucketSummary[];
  probabilityTime: readonly MispricingAtlasBucketSummary[];
  probabilityRegime: readonly MispricingAtlasBucketSummary[];
  probabilityMoneyness: readonly MispricingAtlasBucketSummary[];
  moneynessTime: readonly MispricingAtlasBucketSummary[];
  volatilityMoneyness: readonly MispricingAtlasBucketSummary[];
  volatilityProbabilityTime: readonly MispricingAtlasBucketSummary[];
  probabilityMomentum: readonly MispricingAtlasBucketSummary[];
  momentumTime: readonly MispricingAtlasBucketSummary[];
  momentumVolatility: readonly MispricingAtlasBucketSummary[];
  probabilityMomentumTime: readonly MispricingAtlasBucketSummary[];
  probabilityHour: readonly MispricingAtlasBucketSummary[];
  probabilityWeekday: readonly MispricingAtlasBucketSummary[];
  momentumHour: readonly MispricingAtlasBucketSummary[];
  timeRemainingHour: readonly MispricingAtlasBucketSummary[];
};

export type MispricingAtlasWarning = {
  code: "missing-settlement" | "missing-probability" | "missing-context";
  message: string;
  marketTicker?: string;
};

export type MispricingAtlasMemoryDiagnostics = {
  filesProcessed: number;
  peakHeapUsedBytes: number | null;
  largestFileBytes: number;
  largestFilePath: string | null;
  totalObservations: number;
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
  momentumBuckets?: readonly MispricingAtlasBucketSummary[];
  hourUtcBuckets?: readonly MispricingAtlasBucketSummary[];
  dayOfWeekUtcBuckets?: readonly MispricingAtlasBucketSummary[];
  sessionBucketBuckets?: readonly MispricingAtlasBucketSummary[];
  weekendFlagBuckets?: readonly MispricingAtlasBucketSummary[];
  coarseBuckets?: MispricingAtlasCoarseBuckets;
  coverageDiagnostics?: MispricingAtlasCoverageDiagnostics;
  memoryDiagnostics?: MispricingAtlasMemoryDiagnostics;
  warnings: readonly MispricingAtlasWarning[];
};

export type RegimeVolatilityByMarketKey = Map<
  string,
  "low" | "medium" | "high"
>;

export type BuildMispricingAtlasInput = {
  inputRoot: string;
  outputPath: string;
  generatedAt: string;
  scanned: readonly import("@/lib/data/research/calibration/calibrationTypes").ScannedCalibrationResearchOutput[];
  regimeVolatilityByMarket?: RegimeVolatilityByMarketKey;
  minSampleThreshold?: number;
  memoryReport?: boolean;
};

export type MispricingAtlasIo = {
  readdir: (path: string) => readonly string[];
  readFile: (path: string) => string;
  fileExists: (path: string) => boolean;
  isDirectory: (path: string) => boolean;
};
