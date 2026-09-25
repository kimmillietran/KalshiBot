/**
 * M17 data-acquisition feasibility audit — classify how missing exploratory
 * inputs could be obtained. No purchase, no cost-incurring network, no P&L,
 * no frozen strategy invention.
 */

export const M17_ACQUISITION_FEASIBILITY_STUDY_ID =
  "kalshi-kxbtc15m-m17-data-acquisition-feasibility-v0" as const;

export const M17_ACQUISITION_FEASIBILITY_ANALYSIS_VERSION =
  "m17-data-acquisition-feasibility-v0.1" as const;

export const M17_ACQUISITION_FEASIBILITY_DISCLAIMER =
  "Acquisition-feasibility audit only. No purchase, subscription, capture, trade, "
  + "or order occurred during this study. Public documentation was inspected; no "
  + "vendor was contacted and no cost-incurring network requests were made. Does "
  + "not freeze the M17 settlement-state→entry mapping. Does not compute strategy "
  + "P&L. Does not recommend purchasing pristine validation/holdout data. A "
  + "prospective capture is not historical coverage of the 34 SPENT days.";

/** Exactly one class per missing input. */
export type M17AcquisitionAvailabilityClass =
  | "available-existing"
  | "derivable-existing"
  | "purchasable-historical"
  | "prospective-only"
  | "unverified"
  | "not-obtainable";

export type M17AcquisitionInputId =
  | "coinbase-pre-entry-1m-ohlc-spent-calendar"
  | "historical-brti-raw-observations"
  | "historical-brti-banked-60-sample-path"
  | "exact-5hz-to-1hz-window-identity"
  | "frozen-yes-overpriced-enter-no-mapping";

export type M17AcquisitionDecisionStatus =
  | "existing-data-sufficient-after-offline-derivation"
  | "historical-exploratory-data-purchasable"
  | "exploratory-data-prospective-only"
  | "acquisition-path-unverified"
  | "strategy-remains-blocked";

export type M17AcquisitionCandidateProduct = {
  provider: string;
  productOrFeedName: string;
  inputIdsAddressed: M17AcquisitionInputId[];
  historicalVsProspective: "historical" | "prospective" | "both" | "unverified";
  dateRangeAvailable: string;
  resolutionAndSampleRate: string;
  rawFieldsProvided: string;
  sourceTimestamps: string;
  receiptTimestamps: string;
  includesBrtiOrCfbValues: string;
  documents5hzTo1hzSemantics: string;
  sameMarketBookAdapterAsM16Er: string;
  expectedCostOrPricing: string;
  licensingOrRedistribution: string;
  supportsLeakageSafeM17Exploratory: string;
  blockersRemainingAfterAcquire: string[];
  evidenceUrlsOrPaths: string[];
  notes: string;
};

export type M17AcquisitionInputClassification = {
  inputId: M17AcquisitionInputId;
  classification: M17AcquisitionAvailabilityClass;
  summary: string;
  alreadyExistsLocally: boolean;
  derivableFromRetainedRaw: boolean;
  purchasableHistorically: boolean | "unverified";
  prospectiveOnly: boolean;
  evidencePaths: string[];
  publicEvidenceUrls: string[];
  sha256Identities: Record<string, string>;
  blockersAfterAcquire: string[];
};

export type M17AcquisitionEnablement = {
  exploratoryEvalOn34SpentDays: boolean;
  exploratoryEvalOn34SpentDaysNote: string;
  newExploratoryProspectiveStudy: boolean;
  newExploratoryProspectiveStudyNote: string;
  confirmatoryHoldoutEvaluation: boolean;
  confirmatoryHoldoutEvaluationNote: string;
};

export type M17DataAcquisitionFeasibilityReport = {
  studyId: typeof M17_ACQUISITION_FEASIBILITY_STUDY_ID;
  analysisVersion: typeof M17_ACQUISITION_FEASIBILITY_ANALYSIS_VERSION;
  disclaimer: typeof M17_ACQUISITION_FEASIBILITY_DISCLAIMER;
  generatedAtUtc: string;
  codeAuthoritySha: string | null;
  baseMainSha: string;
  decisionStatus: M17AcquisitionDecisionStatus;
  purchaseMade: false;
  subscriptionStarted: false;
  captureStarted: false;
  tradeOrOrderPlaced: false;
  networkRequestsIncurringCost: 0;
  strategyPnlComputed: false;
  strategyRuleInventedOrTuned: false;
  pristineHoldoutPurchaseRecommended: false;
  retainedDatasetFacts: {
    validSettlementJoins: number;
    spentUtcDayCount: number;
    yesBboDerivableFromCryptostruct: true;
    executableNoAskAs100MinusYesBid: true;
    entryTimestampsAndExpirationPresent: true;
    sourceAndExchangeTimestampsPresent: true;
  };
  coinbaseVolatilityContract: {
    instrument: string;
    timezone: string;
    candleCloseConvention: string;
    lookbackBars: number;
    requiredCloseCount: number;
    returnIntervalMs: number;
    excludeInProgressMinute: true;
    notes: string;
  };
  brtiPathDistinctions: {
    rawBrtiObservations: string;
    vendorComputed1hzOr5hzSeries: string;
    sixtySampleBankedAverage: string;
    finalOfficialSettlementValue: string;
  };
  classifications: M17AcquisitionInputClassification[];
  classificationCounts: Record<M17AcquisitionAvailabilityClass, number>;
  candidateProducts: M17AcquisitionCandidateProduct[];
  estimatedMinimumAcquisitionNeeded: string[];
  enablement: M17AcquisitionEnablement;
  prospectiveExploratoryOption: {
    described: true;
    authorized: false;
    executed: false;
    summary: string;
  };
  remainingBlockers: string[];
  localEvidenceSha256: Record<string, string>;
  publicEvidenceUrls: string[];
};
