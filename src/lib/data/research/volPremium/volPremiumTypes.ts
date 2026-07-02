import type { RegimeMarketTags } from "@/lib/data/research/regimeTagging/regimeTaggingTypes";

export const VOL_PREMIUM_STUDY_FILENAME = "vol-premium-study.json";
export const DEFAULT_VOL_PREMIUM_INPUT_DIR = "data/research-results";
export const DEFAULT_VOL_PREMIUM_OUTPUT_PATH =
  "data/research-results/vol-premium-study.json";

export const DEFAULT_VOL_PREMIUM_VOLATILITY_LOOKBACK_BARS = 10;
export const DEFAULT_VOL_PREMIUM_REGIME_TAGS_FILENAME = "regime-tags.json";

export const VolPremiumErrorCode = {
  INVALID_JSON: "invalid-json",
  INVALID_DOCUMENT: "invalid-document",
  MISSING_INPUT_DIRECTORY: "missing-input-directory",
} as const;

export type VolPremiumErrorCode =
  (typeof VolPremiumErrorCode)[keyof typeof VolPremiumErrorCode];

export class VolPremiumError extends Error {
  readonly code: VolPremiumErrorCode;

  constructor(message: string, code: VolPremiumErrorCode) {
    super(message);
    this.name = "VolPremiumError";
    this.code = code;
  }
}

export const ImpliedVolatilityInversionCode = {
  OK: "ok",
  BOUNDARY_PROBABILITY: "boundary-probability",
  ATM_MISMATCH: "atm-mismatch",
  MISSING_INPUT: "missing-input",
  ZERO_TIME: "zero-time",
} as const;

export type ImpliedVolatilityInversionCode =
  (typeof ImpliedVolatilityInversionCode)[keyof typeof ImpliedVolatilityInversionCode];

export type VolPremiumObservation = {
  strategyId: string;
  seriesTicker: string;
  marketTicker: string;
  outputPath: string;
  stepIndex: number;
  impliedProbability: number;
  spotPrice: number | null;
  strikePrice: number | null;
  timeRemainingMs: number | null;
  moneynessPercent: number | null;
  impliedVolatilityAnnualized: number | null;
  inversionCode: ImpliedVolatilityInversionCode;
  realizedVolatilityBackwardAnnualized: number | null;
  realizedVolatilityForwardAnnualized: number | null;
  volPremium: number | null;
  regimeTags: RegimeMarketTags | null;
};

export type VolPremiumBucketSummary = {
  bucketId: string;
  bucketLabel: string;
  observations: number;
  averageImpliedVolatility: number | null;
  averageRealizedVolatilityForward: number | null;
  averageVolPremium: number | null;
};

export type VolPremiumInversionCounts = Record<ImpliedVolatilityInversionCode, number>;

export type VolPremiumOverallSummary = {
  observations: number;
  invertibleObservations: number;
  averageImpliedVolatility: number | null;
  averageRealizedVolatilityForward: number | null;
  averageVolPremium: number | null;
  inversionCounts: VolPremiumInversionCounts;
};

export type VolPremiumMarketSummary = {
  strategyId: string;
  seriesTicker: string;
  marketTicker: string;
  outputPath: string;
  observationCount: number;
  invertibleObservationCount: number;
  averageImpliedVolatility: number | null;
  averageRealizedVolatilityForward: number | null;
  averageVolPremium: number | null;
  inversionCounts: VolPremiumInversionCounts;
};

export type VolPremiumSampleCounts = {
  totalObservations: number;
  marketCount: number;
  skippedMissingSettlement: number;
  skippedMissingProbability: number;
  skippedMissingContext: number;
  regimeTaggedObservations: number;
};

export type VolPremiumWarning = {
  code:
    | "missing-settlement"
    | "missing-probability"
    | "missing-context"
    | "empty-dataset"
    | "missing-regime-tags";
  message: string;
  marketTicker?: string;
};

export type VolPremiumStudy = {
  generatedAt: string;
  inputRoot: string;
  outputPath: string;
  regimeTagsPath: string | null;
  sampleCounts: VolPremiumSampleCounts;
  overallSummary: VolPremiumOverallSummary;
  markets: readonly VolPremiumMarketSummary[];
  timeRemainingBuckets: readonly VolPremiumBucketSummary[];
  moneynessBuckets: readonly VolPremiumBucketSummary[];
  impliedVolatilityBuckets: readonly VolPremiumBucketSummary[];
  realizedVolatilityBuckets: readonly VolPremiumBucketSummary[];
  volPremiumBuckets: readonly VolPremiumBucketSummary[];
  regimeVolatilityBuckets: readonly VolPremiumBucketSummary[];
  regimeTrendBuckets: readonly VolPremiumBucketSummary[];
  regimeMarketStateBuckets: readonly VolPremiumBucketSummary[];
  warnings: readonly VolPremiumWarning[];
};

export type BuildVolPremiumStudyInput = {
  inputRoot: string;
  outputPath: string;
  generatedAt: string;
  scanned: readonly import("@/lib/data/research/calibration/calibrationTypes").ScannedCalibrationResearchOutput[];
  regimeTagsByJoinKey?: ReadonlyMap<string, RegimeMarketTags>;
  volatilityLookbackBars?: number;
};

export type VolPremiumIo = {
  readdir: (path: string) => readonly string[];
  readFile: (path: string) => string;
  fileExists: (path: string) => boolean;
  isDirectory: (path: string) => boolean;
};
