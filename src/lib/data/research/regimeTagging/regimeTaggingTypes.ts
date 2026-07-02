export const REGIME_TAGS_FILENAME = "regime-tags.json";
export const DEFAULT_REGIME_TAGGING_INPUT_DIR = "data/research-results";
export const DEFAULT_REGIME_TAGGING_OUTPUT_PATH =
  "data/research-results/regime-tags.json";

export const DEFAULT_REGIME_VOLATILITY_LOOKBACK_BARS = 5;

export const RegimeTaggingErrorCode = {
  INVALID_JSON: "invalid-json",
  INVALID_DOCUMENT: "invalid-document",
} as const;

export type RegimeTaggingErrorCode =
  (typeof RegimeTaggingErrorCode)[keyof typeof RegimeTaggingErrorCode];

export class RegimeTaggingError extends Error {
  readonly code: RegimeTaggingErrorCode;

  constructor(message: string, code: RegimeTaggingErrorCode) {
    super(message);
    this.name = "RegimeTaggingError";
    this.code = code;
  }
}

export type VolatilityRegimeTag = "low" | "medium" | "high";
export type TrendRegimeTag = "uptrend" | "downtrend" | "sideways";
export type MarketStateRegimeTag = "quiet" | "trending" | "reversal" | "choppy";

export type RegimeTimeRemainingProfile = {
  minMs: number;
  maxMs: number;
  averageMs: number;
};

export type RegimeMarketMetrics = {
  realizedVolatilityAnnualized: number | null;
  trendStrengthScore: number;
  trendSlopePerBar: number;
  btcReturnPercent: number | null;
  rangePercent: number | null;
  timeRemainingProfile: RegimeTimeRemainingProfile | null;
  averageSpreadPercent: number | null;
  averageImpliedProbability: number | null;
  stepCount: number;
};

export type RegimeMarketTags = {
  volatility: VolatilityRegimeTag | null;
  trend: TrendRegimeTag | null;
  marketState: MarketStateRegimeTag | null;
};

export type RegimeMarketEntry = {
  joinKey: string;
  strategyId: string;
  seriesTicker: string;
  marketTicker: string;
  outputPath: string;
  metrics: RegimeMarketMetrics;
  tags: RegimeMarketTags;
};

export type RegimeSummaryCounts = {
  volatility: Record<VolatilityRegimeTag, number>;
  trend: Record<TrendRegimeTag, number>;
  marketState: Record<MarketStateRegimeTag, number>;
};

export type RegimeTaggingWarning = {
  code: string;
  message: string;
  marketTicker?: string;
};

export type RegimeTaggingSampleCounts = {
  marketCount: number;
  taggedMarketCount: number;
  skippedMarkets: number;
  totalSteps: number;
};

export type RegimeTagsReport = {
  generatedAt: string;
  inputRoot: string;
  outputPath: string;
  sampleCounts: RegimeTaggingSampleCounts;
  summaryCounts: RegimeSummaryCounts;
  markets: readonly RegimeMarketEntry[];
  warnings: readonly RegimeTaggingWarning[];
};

export type RegimeTaggingIo = {
  readdir: (path: string) => readonly string[];
  readFile: (path: string) => string;
  fileExists: (path: string) => boolean;
  isDirectory: (path: string) => boolean;
};

export type BuildRegimeTagsReportInput = {
  inputRoot: string;
  outputPath: string;
  generatedAt: string;
  scanned: readonly import("@/lib/data/research/calibration/calibrationTypes").ScannedCalibrationResearchOutput[];
};

export type RegimeStepPoint = {
  stepIndex: number;
  timestampMs: number;
  btcPrice: number;
  impliedProbability: number;
  maxSpreadPercent: number | null;
  timeRemainingMs: number | null;
};
