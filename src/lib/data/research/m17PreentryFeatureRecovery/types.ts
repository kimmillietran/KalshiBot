/**
 * M17 pre-entry feature recovery — coverage measurement only.
 * No strategy P&L, no entry simulation, no settlement-outcome ranking.
 */

import {
  V2_CANDLE_CLOSE_OFFSET_MS,
  V2_REQUIRED_CLOSE_COUNT,
  V2_REQUIRED_LOOKBACK_BARS,
} from "../calibrationFadeV2ForwardValidation/calibrationFadeV2ForwardValidationTypes";
import { M17_CITED_REGIME_FILTERS } from "../m17SpentHoldToSettlementEval/types";

export const M17_PREENTRY_FEATURE_RECOVERY_STUDY_ID =
  "kalshi-kxbtc15m-m17-preentry-feature-recovery-v0" as const;

export const M17_PREENTRY_FEATURE_RECOVERY_ANALYSIS_VERSION =
  "m17-preentry-feature-recovery-v0.1" as const;

export const M17_PREENTRY_FEATURE_RECOVERY_DISCLAIMER =
  "Feature-preparation coverage audit on M16-ER SPENT_VALIDATION retained "
  + "executable samples only. Regenerates pre-entry book/time/volatility "
  + "features for measurement. Does not compute strategy P&L, simulate entries, "
  + "rank candidates by settlement outcomes, freeze the M17 entry rule, or "
  + "resolve O6 settlement-fidelity questions. Feature coverage is not a "
  + "strategy result.";

/** Frozen Coinbase completed-1m realized-vol contract (M16/M17 / calibration-fade v2). */
export const M17_PREENTRY_VOLATILITY_CONTRACT = {
  instrument: "BTC-USD",
  provider: "coinbase-exchange-public-rest",
  sourceRecordType: "exchange-completed-1m-ohlc",
  lookbackBars: V2_REQUIRED_LOOKBACK_BARS,
  requiredCloseCount: V2_REQUIRED_CLOSE_COUNT,
  candleCloseOffsetMs: V2_CANDLE_CLOSE_OFFSET_MS,
  returnIntervalMs: 60_000,
  /**
   * Completed candles are eligible only when closeTimeMs < entryTimestampMs
   * (frozen v2 / historical-replica convention). In-progress minute excluded.
   */
  completedCandleEligibility: "closeTimeMs < entryTimestampMs",
  annualization: "log-return stdev * sqrt(MS_PER_YEAR / barIntervalMs)",
  formulaAuthority:
    "src/lib/data/strategies/fairValueDiffusion/fairValueDiffusionModel.ts#estimateRealizedVolatility",
  windowAuthority:
    "src/lib/data/research/calibrationFadeV2ForwardValidation/buildHistoricalReplicaVolatilityWindow.ts",
  /**
   * Cited high-vol regime bound from frozen hypothesis (coverage labeling only;
   * not used to select or tune strategy candidates here).
   */
  citedHighVolMinInclusive: M17_CITED_REGIME_FILTERS.volatilityMinInclusive,
  regimeThresholdAuthority: M17_CITED_REGIME_FILTERS.sourceHypothesisPath,
} as const;

export const M17_PREENTRY_COINBASE_PUBLIC_SOURCE = {
  baseUrl: "https://api.exchange.coinbase.com",
  path: "/products/BTC-USD/candles",
  granularitySeconds: 60,
  docsUrl:
    "https://docs.cdp.coinbase.com/exchange/reference/exchangerestapi_getproductcandles",
  authenticationRequired: false,
  purchaseRequired: false,
  notedInPr: 127,
} as const;

export type BookFeatureStatus =
  | "ok"
  | "missing-bbo"
  | "timestamp-not-found-in-stream"
  | "market-file-missing-in-zip"
  | "missing-zip"
  | "not-attempted";

export type VolatilityFeatureStatus =
  | "ok"
  | "insufficient-completed-minutes"
  | "candles-unavailable"
  | "estimate-unavailable"
  | "not-attempted";

export type PreentryBookFeatureRow = {
  utcDayKey: string;
  marketTicker: string;
  entryTimestampMs: number;
  closeTimeMs: number | null;
  timeRemainingMs: number | null;
  yesBidCents?: number;
  yesAskCents?: number;
  yesMidpoint?: number;
  noAskCents?: number;
  halfSpreadCents?: number;
  bookFeatureStatus: BookFeatureStatus;
  halfSpreadMismatch: {
    retainedHalfSpreadCents: number;
    regeneratedHalfSpreadCents: number;
  } | null;
  retainedEntryHalfSpreadCents?: number | null;
  retainedEntryFrictionCents?: number | null;
  retainedEntryFeeCents?: number | null;
};

export type PreentryFeatureRow = PreentryBookFeatureRow & {
  annualizedRealizedVolatility: number | null;
  volatilityFeatureStatus: VolatilityFeatureStatus;
  volatilityCandleCount: number;
  volatilitySelectedOpenTimeMs: readonly number[];
  marketFeaturesComplete: boolean;
  timeFeaturesComplete: boolean;
  volatilityFeatureComplete: boolean;
  marketTimeVolFeaturesComplete: boolean;
  citedHighVolRegime: boolean | null;
};

export type CandleDayCoverage = {
  utcDayKey: string;
  candleCount: number;
  expectedMinuteCount: number;
  gapCount: number;
  firstOpenTimeMs: number | null;
  lastOpenTimeMs: number | null;
  sha256: string | null;
  localPath: string | null;
};

export type FeatureCoverageCounts = {
  rows: number;
  markets: number;
  utcDays: number;
  bookOk: number;
  halfSpreadMismatch: number;
  timeRemainingPresent: number;
  volatilityOk: number;
  marketTimeVolComplete: number;
  citedHighVolTrue: number;
  citedHighVolFalse: number;
  citedHighVolUnknown: number;
};

export type M17PreentryFeatureRecoveryReport = {
  studyId: typeof M17_PREENTRY_FEATURE_RECOVERY_STUDY_ID;
  analysisVersion: typeof M17_PREENTRY_FEATURE_RECOVERY_ANALYSIS_VERSION;
  disclaimer: typeof M17_PREENTRY_FEATURE_RECOVERY_DISCLAIMER;
  generatedAtUtc: string;
  codeAuthoritySha: string;
  baseMainSha: string;
  volatilityContract: typeof M17_PREENTRY_VOLATILITY_CONTRACT;
  coinbasePublicSource: typeof M17_PREENTRY_COINBASE_PUBLIC_SOURCE;
  inputs: {
    samplesPath: string;
    samplesSha256: string;
    samplesRowCount: number;
    rawZipDir: string;
    rawZipCount: number;
    adapterId: string;
    adapterIdentity: string;
    bookFeaturesPath: string | null;
    bookFeaturesSha256: string | null;
    candlesDir: string | null;
  };
  coinbaseRetrieval: {
    attempted: boolean;
    usableWithoutCost: boolean | null;
    authenticationRequired: boolean;
    purchaseOrSubscriptionEncountered: boolean;
    blocker: string | null;
    retrievedUtcDays: number;
    totalCandles: number;
    timestampConvention:
      | "exchange-bucket-start-open; close=open+59999ms (frozen research)"
      | "not-retrieved";
  };
  candleCoverageByDay: CandleDayCoverage[];
  coverage: FeatureCoverageCounts;
  coverageByUtcDay: Array<{
    utcDayKey: string;
    rows: number;
    bookOk: number;
    halfSpreadMismatch: number;
    volatilityOk: number;
    marketTimeVolComplete: number;
  }>;
  missingness: {
    bookStatusCounts: Record<string, number>;
    volatilityStatusCounts: Record<string, number>;
    exclusions: string[];
  };
  attestation: {
    purchaseOccurred: false;
    subscriptionOccurred: false;
    tradeOrOrderOccurred: false;
    strategyPnlComputed: false;
    strategyResultClaimed: false;
    m17EntryRuleModifiedOrFrozen: false;
    o6SettlementFidelityResolved: false;
    settlementOutcomesUsedForRankingOrTuning: false;
    liveCaptureStarted: false;
    brtiOrBankedOr5hzIdentityInferred: false;
  };
};
