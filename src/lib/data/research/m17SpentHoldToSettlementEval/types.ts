/**
 * M17 exploratory SPENT hold-to-settlement evaluation types.
 *
 * This module may produce a blocked report when frozen entry decisions are
 * missing. It must not invent thresholds or compute P&L under an unfrozen rule.
 */

export const M17_SPENT_HTS_STUDY_ID =
  "kalshi-kxbtc15m-m17-spent-hold-to-settlement-eval-v0" as const;

export const M17_SPENT_HTS_ANALYSIS_VERSION =
  "m17-spent-hold-to-settlement-eval-v0.1" as const;

export const M17_SPENT_HTS_DISCLAIMER =
  "Exploratory analysis on M16-ER SPENT_VALIDATION data only. Not confirmatory, "
  + "not pristine, not holdout, not evidence of live profitability. Do not tune "
  + "thresholds or select markets from these results. avg_60s_data remains "
  + "research-only and is not wired into strategy gates.";

export const M17_SPENT_DATASET_PROVENANCE = "SPENT_VALIDATION (M16-ER)" as const;

/** Regime filters cited from frozen high-volatility late-market calibration-fade v2. */
export const M17_CITED_REGIME_FILTERS = {
  sourceHypothesisPath:
    "config/research/hypotheses/high-volatility-late-market-calibration-fade-v2.json",
  yesMidpointInclusiveMin: 1 / 3,
  yesMidpointExclusiveMax: 2 / 3,
  timeRemainingMsExclusiveMax: 900_000,
  volatilityMinInclusive: 0.6,
  calibrationDirection: "over" as const,
  targetSide: "NO" as const,
  note:
    "Cited as the previously specified late high-vol / mid-range / <15m regime. "
    + "M17 settlement-state entry still requires a frozen mapping from "
    + "settlement-state arithmetic to YES-overpriced; citing these filters does "
    + "not authorize inventing that mapping on SPENT outcomes.",
} as const;

export type M17FrozenDecisionStatus = "frozen" | "proposed-unfrozen" | "absent-on-retained-data";

export type M17FrozenDecisionItem = {
  id: string;
  status: M17FrozenDecisionStatus;
  summary: string;
  authority: string;
};

export type M17EvalCompletionStatus =
  | "blocked-missing-frozen-decisions"
  | "complete-exploratory-spent";

export type M17FeatureAvailability = {
  executableBookSamples: number;
  unambiguousMarketIdentity: number;
  validOfficialSettlementJoin: number;
  incompleteTickerExcluded: number;
  nonNumericExpirationExcluded: number;
  /** YES bid/ask midpoint present on retained sample rows. */
  yesMidpointPresent: number;
  /** Coinbase completed-1m OHLC realized vol available at entry. */
  highVolatilityFeaturePresent: number;
  /** Minutes-to-close / timeRemaining computable from retained fields. */
  timeRemainingFeaturePresent: number;
  /** Pre-entry BRTI / banked settlement samples available. */
  settlementStatePathPresent: number;
  /** Remaining-average threshold computable from pre-entry banked samples. */
  remainingAverageThresholdPresent: number;
  completeRequiredFeaturesForEntry: number;
};

export type M17PerformanceBlock = {
  status: "blocked" | "computed-spent-exploratory";
  reason: string | null;
  noEntriesSimulated: number;
  grossTerminalOutcomeCentsSum: number | null;
  oneTakerFeeAdjustedReturnCentsSum: number | null;
  winRate: number | null;
  averageReturnCents: number | null;
  medianReturnCents: number | null;
  varianceReturnCents: number | null;
  maxDrawdownCents: number | null;
};

export type M17SpentHoldToSettlementReport = {
  studyId: typeof M17_SPENT_HTS_STUDY_ID;
  analysisVersion: typeof M17_SPENT_HTS_ANALYSIS_VERSION;
  disclaimer: typeof M17_SPENT_HTS_DISCLAIMER;
  generatedAtUtc: string;
  codeAuthoritySha: string | null;
  completionStatus: M17EvalCompletionStatus;
  datasetProvenance: typeof M17_SPENT_DATASET_PROVENANCE;
  inputIdentities: Record<string, string>;
  strategyDefinitionUsed: {
    name: "hold-to-settlement-terminal-mispricing";
    side: "NO";
    fee: "one-standard-taker-schedule";
    outcomeLabel: "official-expiration_value-post-entry-only";
    avg60sDataWiredIntoGates: false;
    citedRegimeFilters: typeof M17_CITED_REGIME_FILTERS;
    settlementEstimateSemantics: {
      expirationValue: "authoritative-after-settlement-outcome-label-only";
      avg60sData: "research-only-empirical-candidate-not-a-gate";
      last60sWindowedAverage15min: "diagnostic-only";
    };
  };
  frozenDecisionInventory: M17FrozenDecisionItem[];
  missingFrozenDecisionsBlockingPnl: string[];
  featureAvailability: M17FeatureAvailability;
  candidatePopulation: {
    retainedExecutableSamples: number;
    claimedPriorEntryArtifact:
      | "unavailable-not-found-in-retained-artifacts";
    recomputedUnderFrozenRegimeFilters: number | null;
    recomputedRegimeFilterNote: string;
    independentMarketsInRetainedExecutable: number;
    datesInRetainedExecutable: number;
    validSettlementLabelCoverageShare: number;
  };
  performance: M17PerformanceBlock;
  baselines: {
    noTrade: { meanFeeAdjustedReturnCents: 0; note: string };
    marketImplied: {
      status: "not-computed";
      reason: string;
    };
    fixedSettlementThreshold: {
      status: "not-defined-in-frozen-m17-design";
      reason: string;
    };
  };
  confirmatoryBoundary: {
    isSpentExploratory: true;
    canEstablishOutOfSamplePerformance: false;
    canJustifyLiveTrading: false;
    pristinePurchaseNeeds: string[];
  };
  pristinePurchaseRecommendation: {
    justifiedNow: boolean;
    rationale: string;
  };
  zeroNetworkConfirmation: {
    marketDataRequests: 0;
    websocketCaptures: 0;
    cryptostructPurchases: 0;
    trades: 0;
    orderPlacements: 0;
  };
  leakageControlsApplied: string[];
};
