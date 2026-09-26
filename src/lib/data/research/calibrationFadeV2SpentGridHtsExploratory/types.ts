/**
 * Exploratory SPENT grid-entry hold-to-settlement variant of calibration-fade v2.
 * Study ID: kalshi-kxbtc15m-calibration-fade-v2-spent-grid-hts-exploratory-v0
 *
 * Authorized offline simulated P&L at observed quotes. Does not modify the
 * continuous-first-crossing hypothesis config.
 */

export const CF_V2_SPENT_GRID_HTS_STUDY_ID =
  "kalshi-kxbtc15m-calibration-fade-v2-spent-grid-hts-exploratory-v0" as const;

export const CF_V2_SPENT_GRID_HTS_ANALYSIS_VERSION =
  "calibration-fade-v2-spent-grid-hts-exploratory-v0.1" as const;

export const CF_V2_SPENT_GRID_HTS_DISCLAIMER =
  "Exploratory SPENT_VALIDATION grid-entry hold-to-settlement simulation on "
  + "M16-ER retained friction observations. Simulated P&L at observed quotes "
  + "only — not live fills, not confirmatory, not pristine. Does not modify or "
  + "rerun continuous-first-crossing calibration-fade v2. A negative grid "
  + "result does not reject continuous-first-crossing; a positive result does "
  + "not establish live fillability.";

export const CF_V2_HYPOTHESIS_PATH =
  "config/research/hypotheses/high-volatility-late-market-calibration-fade-v2.json" as const;

export const CF_V2_SPENT_GRID_DATASET_PROVENANCE =
  "SPENT_VALIDATION (M16-ER retained friction grid + settlement label backfill)" as const;

/** Frozen eligibility bounds (mirror v2 hypothesis + grid book gates). */
export const CF_V2_SPENT_GRID_ELIGIBILITY = {
  yesMidpointMinInclusive: 1 / 3,
  yesMidpointMaxExclusive: 2 / 3,
  timeRemainingMsMinExclusive: 0,
  timeRemainingMsMaxExclusive: 900_000,
  volatilityMinInclusive: 0.6,
  noAskCentsMinExclusive: 0,
  noAskCentsMaxExclusive: 100,
  requireBookFeatureStatusOk: true,
  requireCitedHighVolRegime: true,
  excludeCrossed: true,
  excludeLocked: true,
  requireNoAskEquals100MinusYesBid: true,
} as const;

export type PreentryFeatureRow = {
  utcDayKey: string;
  marketTicker: string;
  entryTimestampMs: number;
  closeTimeMs?: number | null;
  timeRemainingMs?: number | null;
  yesBidCents?: number | null;
  yesAskCents?: number | null;
  yesMidpoint?: number | null;
  noAskCents?: number | null;
  yesBidSize?: number | null;
  yesAskSize?: number | null;
  crossed?: boolean | null;
  locked?: boolean | null;
  bookFeatureStatus?: string | null;
  citedHighVolRegime?: boolean | null;
  annualizedRealizedVolatility?: number | null;
  volatilityFeatureStatus?: string | null;
  halfSpreadMismatch?: {
    retainedHalfSpreadCents: number;
    regeneratedHalfSpreadCents: number;
  } | null;
  retainedEntryHalfSpreadCents?: number | null;
};

export type SettlementLabelRow = {
  marketTicker: string;
  result?: string | null;
  expirationValue?: string | null;
  closeTime?: string | null;
  settlementTs?: string | null;
};

export type EligibilityFailureReason =
  | "book-feature-not-ok"
  | "cited-high-vol-false-or-missing"
  | "yes-midpoint-out-of-range"
  | "time-remaining-out-of-range"
  | "crossed-book"
  | "locked-book"
  | "invalid-bbo"
  | "no-ask-out-of-range"
  | "no-ask-complement-mismatch"
  | "missing-market-or-timestamp";

export type SelectedEntry = {
  marketTicker: string;
  utcDayKey: string;
  entryTimestampMs: number;
  closeTimeMs: number | null;
  timeRemainingMs: number;
  yesBidCents: number;
  yesAskCents: number;
  yesMidpoint: number;
  noAskCents: number;
  yesBidSize: number | null;
  yesAskSize: number | null;
  annualizedRealizedVolatility: number | null;
  halfSpreadMismatchPresent: boolean;
  /** Class B proxy: mismatch present and retained half not reproducible from regen cents via friction mid (optional). */
  classBReconstructionUncertain: boolean;
  retainedEntryHalfSpreadCents: number | null;
};

export type EvaluableTrade = SelectedEntry & {
  settlementResult: "yes" | "no";
  entryFeeCents: number;
  grossPnlCents: number;
  netPnlCents: number;
  labelCloseTime: string | null;
  labelSettlementTs: string | null;
};

export type UnevaluableReason =
  | "missing-label"
  | "invalid-result"
  | "conflicting-labels";

export type DayClusterStats = {
  utcDayKey: string;
  marketCount: number;
  meanNetPnlCents: number;
  totalNetPnlCents: number;
};

export type Cr2TwoSidedInference = {
  method: string;
  n: number;
  g: number;
  degreesOfFreedom: number;
  sampleMeanCents: number;
  cr2StandardError: number;
  tStatistic: number;
  tCriticalTwoSided95: number;
  ci95LowerCents: number;
  ci95UpperCents: number;
  workingModel: string;
};

export type ExploratoryInterpretation =
  | "insufficient-evidence"
  | "observed-economics-do-not-support-proceeding"
  | "evidence-against-positive-mean"
  | "exploratory-promise"
  | "inconclusive-or-below-material-promise-bar"
  | "blocked-data-integrity";

export type CfV2SpentGridHtsReport = {
  studyId: typeof CF_V2_SPENT_GRID_HTS_STUDY_ID;
  analysisVersion: typeof CF_V2_SPENT_GRID_HTS_ANALYSIS_VERSION;
  disclaimer: typeof CF_V2_SPENT_GRID_HTS_DISCLAIMER;
  generatedAtUtc: string;
  codeAuthoritySha: string;
  datasetProvenance: typeof CF_V2_SPENT_GRID_DATASET_PROVENANCE;
  manifest: Record<string, unknown>;
  coverage: {
    rowsScanned: number;
    eligibleRows: number;
    selectedMarkets: number;
    evaluableMarkets: number;
    unevaluableMarkets: number;
    exclusionCounts: Record<string, number>;
    selectedWithHalfSpreadMismatch: number;
    selectedClassBUncertain: number;
  };
  economics: {
    n: number;
    g: number;
    meanNetPnlCents: number;
    medianNetPnlCents: number;
    totalNetPnlCents: number;
    meanGrossPnlCents: number;
    meanFeeCents: number;
    meanEntryPriceCents: number;
    noSettlementRate: number;
    inference: Cr2TwoSidedInference | null;
    perDay: DayClusterStats[];
    leaveOneDayOutMeansCents: Array<{
      heldOutUtcDayKey: string;
      meanNetPnlCents: number;
      nRemaining: number;
    }>;
  };
  interpretation: {
    status: ExploratoryInterpretation;
    rationale: string;
  };
  executionLimitations: string[];
  priorEvidenceNotes: string[];
  attestation: {
    purchaseOccurred: false;
    subscriptionOccurred: false;
    tradeOrOrderOccurred: false;
    liveCaptureStarted: false;
    continuousCrossingHypothesisModified: false;
    thresholdSweepPerformed: false;
    avg60sUsedAsStrategyFeature: false;
    simulatedPnlAtObservedQuotes: true;
  };
};
