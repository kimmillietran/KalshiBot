/**
 * Paired YES-side accounting/execution diagnostic on PR #134's exact selected cohort.
 * Outcome-informed mirror — not an independent mechanism test or confirmation.
 */

export const CF_V2_YES_MIRROR_DIAGNOSTIC_STUDY_ID =
  "kalshi-kxbtc15m-calibration-fade-v2-spent-grid-hts-yes-mirror-diagnostic-v0" as const;

export const CF_V2_YES_MIRROR_DIAGNOSTIC_ANALYSIS_VERSION =
  "calibration-fade-v2-spent-grid-hts-yes-mirror-diagnostic-v0.1" as const;

export const CF_V2_YES_MIRROR_DIAGNOSTIC_DISCLAIMER =
  "Outcome-informed paired YES-side accounting/execution diagnostic on the exact "
  + "PR #134 selected cohort. Simulated P&L at observed quotes only. Not a new "
  + "independent mechanism, not confirmation, not live fills. Compression toward "
  + "50% does not imply a uniform YES trade throughout [1/3, 2/3). "
  + "Confidence intervals do not remove outcome-informed selection bias.";

export const CF_V2_NO_GRID_STUDY_ID =
  "kalshi-kxbtc15m-calibration-fade-v2-spent-grid-hts-exploratory-v0" as const;

export const CF_V2_NO_GRID_EXPECTED = {
  selectedEntriesSha256:
    "0597917bcb71a0c6623d133f10e18b435c59debb3a4c89da912f7d806d74db08",
  perMarketTradesSha256:
    "904e9f5d505ae7ec016dadeff475be368c04f36a7f2f1cd834860bfff9bcb906",
  nMarkets: 321,
  gDays: 24,
  meanNetPnlCents: -8.641744548286605,
  meanNetPnlCentsRounded4: -8.6417,
} as const;

export type NoSideTradeRow = {
  marketTicker: string;
  utcDayKey: string;
  entryTimestampMs: number;
  yesBidCents: number;
  yesAskCents: number;
  noAskCents: number;
  yesBidSize: number | null;
  yesAskSize: number | null;
  settlementResult: "yes" | "no";
  entryFeeCents: number;
  grossPnlCents: number;
  netPnlCents: number;
};

export type YesMirrorUnevaluableReason =
  | "missing-yes-ask"
  | "invalid-yes-ask"
  | "no-ask-complement-mismatch"
  | "missing-settlement"
  | "identity-violation";

export type PairedMirrorRow = {
  marketTicker: string;
  utcDayKey: string;
  entryTimestampMs: number;
  settlementResult: "yes" | "no";
  yesBidCents: number;
  yesAskCents: number;
  noAskCents: number;
  yesSpreadCents: number;
  yesAskSize: number | null;
  yesBidSize: number | null;
  yesAskSizeStatus: "ok-ge-1" | "known-insufficient" | "missing";
  yesFeeCents: number;
  noFeeCents: number;
  yesGrossPnlCents: number;
  yesNetPnlCents: number;
  noGrossPnlCents: number;
  noNetPnlCents: number;
  identityResidualCents: number;
  identityHolds: boolean;
};

export type YesMirrorDiagnosticReport = {
  studyId: typeof CF_V2_YES_MIRROR_DIAGNOSTIC_STUDY_ID;
  analysisVersion: typeof CF_V2_YES_MIRROR_DIAGNOSTIC_ANALYSIS_VERSION;
  disclaimer: typeof CF_V2_YES_MIRROR_DIAGNOSTIC_DISCLAIMER;
  generatedAtUtc: string;
  codeAuthoritySha: string;
  priorExposure: {
    noGridStudyId: typeof CF_V2_NO_GRID_STUDY_ID;
    noGridResultSummary: string;
    yesMirrorSelectedAfterObservingNoResult: true;
    isIndependentMechanismTest: false;
    isPreOutcomePreregistration: false;
    attemptedHistory: string[];
  };
  cohort: {
    sourceSelectedEntriesSha256: string;
    sourcePerMarketTradesSha256: string;
    hashesVerified: boolean;
    originalN: number;
    originalG: number;
    reproducedNoMeanNetPnlCents: number;
    noMeanMatchesRecordedPrecision: boolean;
    pairedN: number;
    pairedG: number;
    unevaluableCount: number;
    unevaluableReasons: Record<string, number>;
    cohortDiffersFromOriginal321: boolean;
  };
  accounting: {
    identityFormula:
      "yesNetPnl + noNetPnl = -(yesAskCents - yesBidCents) - yesFeeCents - noFeeCents";
    identityHoldsForAllPairedRows: boolean;
    identityViolationCount: number;
    meanNoNetPnlCents: number;
    meanYesSpreadCents: number;
    meanYesFeeCents: number;
    meanNoFeeCents: number;
    meanYesNetFromIdentityCents: number;
    meanYesNetDirectCents: number;
    identityDerivedVsDirectResidualCents: number;
  };
  economics: {
    n: number;
    g: number;
    meanNetPnlCents: number;
    medianNetPnlCents: number;
    totalNetPnlCents: number;
    meanGrossPnlCents: number;
    meanEntryPriceCents: number;
    yesSettlementRate: number;
    inference: import("../calibrationFadeV2SpentGridHtsExploratory/types").Cr2TwoSidedInference | null;
    perDay: Array<{
      utcDayKey: string;
      marketCount: number;
      meanNetPnlCents: number;
      totalNetPnlCents: number;
    }>;
    leaveOneDayOutMeansCents: Array<{
      heldOutUtcDayKey: string;
      meanNetPnlCents: number;
      nRemaining: number;
    }>;
  };
  liquidity: {
    yesAskSizeGe1: number;
    yesAskSizeKnownInsufficient: number;
    yesAskSizeMissing: number;
    note: string;
    sensitivityAskSizeGe1: {
      n: number;
      g: number;
      meanNetPnlCents: number;
      ci95LowerCents: number | null;
      ci95UpperCents: number | null;
    } | null;
  };
  interpretation: {
    status: string;
    rationale: string;
    meritsFreshPeriodTestDesign: boolean;
  };
  executionLimitations: string[];
  attestation: {
    purchaseOccurred: false;
    subscriptionOccurred: false;
    tradeOrOrderOccurred: false;
    liveCaptureStarted: false;
    originalNoOutputsModified: false;
    simulatedPnlAtObservedQuotes: true;
    thresholdSweepPerformed: false;
    favorite085ExperimentRun: false;
    continuousCrossingRun: false;
  };
};
