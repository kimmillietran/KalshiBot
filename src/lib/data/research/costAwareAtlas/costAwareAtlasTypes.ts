import type { ExecutionFeeModel } from "@/lib/data/backtesting/costModel/executionCostModelTypes";
import type { MispricingAtlasBucketSummary } from "@/lib/data/research/mispricingAtlas/mispricingAtlasTypes";

export const COST_AWARE_ATLAS_FILENAME = "cost-aware-atlas.json";
export const DEFAULT_COST_AWARE_ATLAS_INPUT_DIR = "data/research-results";
export const DEFAULT_COST_AWARE_ATLAS_OUTPUT_PATH =
  "data/research-results/cost-aware-atlas.json";
export const DEFAULT_COST_AWARE_ATLAS_HTML_OUTPUT_PATH =
  "data/reports/cost-aware-atlas.html";
export const DEFAULT_COST_AWARE_MISPRICING_ATLAS_PATH =
  "data/research-results/mispricing-atlas.json";

export const DERIVED_SETTLEMENT_QUALITY_FLAG = "derived-expiration-value";

export const CostAwareAtlasErrorCode = {
  INVALID_JSON: "invalid-json",
  INVALID_DOCUMENT: "invalid-document",
  MISSING_INPUT_DIRECTORY: "missing-input-directory",
} as const;

export type CostAwareAtlasErrorCode =
  (typeof CostAwareAtlasErrorCode)[keyof typeof CostAwareAtlasErrorCode];

export class CostAwareAtlasError extends Error {
  readonly code: CostAwareAtlasErrorCode;

  constructor(message: string, code: CostAwareAtlasErrorCode) {
    super(message);
    this.name = "CostAwareAtlasError";
    this.code = code;
  }
}

export type QuoteStatus = "valid" | "missing" | "invalid" | "one-sided";

export type SpreadCohortId =
  | "all"
  | "validBidAsk"
  | "tightSpread"
  | "mediumSpread"
  | "wideSpread"
  | "missingOrInvalidQuote";

export type ImpliedCalibrationSide =
  | "overconfident"
  | "underconfident"
  | "neutral";

export type TradeabilityClassification =
  | "tradeable-positive"
  | "tradeable-negative"
  | "gross-only"
  | "untradeable-wide-spread"
  | "untradeable-missing-quotes"
  | "underpowered"
  | "unknown";

export type SettlementSourceStatus = "official" | "derived" | "unknown";

export type CostAwareMispricingObservation = {
  strategyId: string;
  seriesTicker: string;
  marketTicker: string;
  outputPath: string;
  stepIndex: number;
  predictedProbability: number | null;
  observedOutcome: 0 | 1;
  timeRemainingMs: number | null;
  moneynessPercent: number | null;
  annualizedVolatility: number | null;
  momentumPercent: number | null;
  tradingDayUtc?: string | null;
  timestampMs?: number | null;
  yesBidCents: number | null;
  yesAskCents: number | null;
  spreadPercent: number | null;
  quoteStatus: QuoteStatus;
  settlementSource: SettlementSourceStatus;
};

export type CostAwareAtlasConfig = {
  minSampleThreshold: number;
  neutralCalibrationGapThreshold: number;
  tightSpreadPercentMax: number;
  mediumSpreadPercentMax: number;
  feeModel: ExecutionFeeModel;
};

export type CostAwareCohortMetrics = {
  cohortId: SpreadCohortId;
  observations: number;
  validQuoteObservations: number;
  averageImpliedProbability: number | null;
  realizedFrequency: number | null;
  rawCalibrationGap: number | null;
  impliedSide: ImpliedCalibrationSide;
  grossExpectedValueCents: number | null;
  spreadAdjustedExpectedValueCents: number | null;
  feeAdjustedExpectedValueCents: number | null;
  minimumRequiredEdgeCents: number | null;
  averageHalfSpreadCents: number | null;
  averageFeeCents: number | null;
  tradeability: TradeabilityClassification;
};

export type CostAwareBucketEntry = {
  dimension: string;
  bucketId: string;
  bucketLabel: string;
  atlasCalibrationError: number | null;
  atlasObservations: number;
  settlementSourceStatus: SettlementSourceStatus;
  cohorts: readonly CostAwareCohortMetrics[];
  primaryCohort: CostAwareCohortMetrics;
};

export type CostAwareAtlasRankingEntry = {
  dimension: string;
  bucketId: string;
  bucketLabel: string;
  valueCents: number;
  tradeability: TradeabilityClassification;
  impliedSide: ImpliedCalibrationSide;
  observations: number;
};

export type CostAwareGrossEdgeDisappearanceEntry = {
  dimension: string;
  bucketId: string;
  bucketLabel: string;
  grossExpectedValueCents: number;
  feeAdjustedExpectedValueCents: number;
  edgeLostCents: number;
  observations: number;
};

export type CostAwareAtlasWarning = {
  code:
    | "underpowered-bucket"
    | "fillability-gap"
    | "derived-settlement-share";
  message: string;
  dimension?: string;
  bucketId?: string;
};

export type CostAwareAtlasSummary = {
  totalBuckets: number;
  nonEmptyBuckets: number;
  tradeabilityCounts: Record<TradeabilityClassification, number>;
  tradeablePositiveBuckets: number;
  grossOnlyBuckets: number;
  untradeableBuckets: number;
  underpoweredBuckets: number;
  derivedSettlementObservationShare: number | null;
  officialSettlementObservationShare: number | null;
};

export type CostAwareAtlasReport = {
  generatedAt: string;
  inputRoot: string;
  outputPath: string;
  htmlOutputPath: string;
  mispricingAtlasPath: string | null;
  config: CostAwareAtlasConfig;
  summary: CostAwareAtlasSummary;
  buckets: readonly CostAwareBucketEntry[];
  rankings: {
    topGrossEdges: readonly CostAwareAtlasRankingEntry[];
    topNetEdges: readonly CostAwareAtlasRankingEntry[];
    largestGrossEdgeDisappearances: readonly CostAwareGrossEdgeDisappearanceEntry[];
  };
  warnings: readonly CostAwareAtlasWarning[];
};

export type CostAwareAtlasIo = {
  readdir: (path: string) => readonly string[];
  readFile: (path: string) => string;
  fileExists: (path: string) => boolean;
  isDirectory: (path: string) => boolean;
};

export type MispricingAtlasBucketReference = {
  dimension: string;
  bucket: MispricingAtlasBucketSummary;
};
