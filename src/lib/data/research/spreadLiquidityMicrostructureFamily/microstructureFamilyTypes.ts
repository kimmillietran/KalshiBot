/**
 * M13.0a — Governed TOB size-imbalance microstructure family definition.
 *
 * Definition / causal-feature infrastructure only. No historical discovery.
 */

export const MICROSTRUCTURE_FAMILY_ID = "spread-liquidity-microstructure" as const;
export const MICROSTRUCTURE_SUBFAMILY_ID =
  "tob-size-imbalance-short-horizon-repricing-v1" as const;

export const MICROSTRUCTURE_FAMILY_DEFINITION_VERSION =
  "tob-size-imbalance-short-horizon-repricing-v1" as const;

export const MICROSTRUCTURE_FAMILY_DISCLAIMER =
  "M13.0a defines the governed TOB size-imbalance microstructure family only. "
  + "It does not run historical discovery, ranking, validation, holdout, promotion, "
  + "preregistration, prospective freeze, capture, or live trading. "
  + "Ask-side size is a complement of the opposite bid ladder, not independently captured depth. "
  + "Size decreases are not classified as cancellations, trades, or true liquidity withdrawal. "
  + "BTC features are forbidden. Independent of the deferred lead-lag lineage.";

export const DEFAULT_MICROSTRUCTURE_FAMILY_JSON_ROOT =
  "data/research-results/spread-liquidity-microstructure/family-definition" as const;
export const DEFAULT_MICROSTRUCTURE_FAMILY_HTML_ROOT =
  "data/reports/spread-liquidity-microstructure/family-definition" as const;
export const MICROSTRUCTURE_FAMILY_JSON_FILENAME =
  "tob-imbalance-family-definition.json" as const;
export const MICROSTRUCTURE_FAMILY_HTML_FILENAME =
  "tob-imbalance-family-definition.html" as const;

/** Absolute imbalance thresholds — discrete only; no continuous optimization. */
export const IMBALANCE_THRESHOLD_ABS = [0.4, 0.6] as const;

/** Response horizons in milliseconds — fixed first-pass set. */
export const RESPONSE_HORIZONS_MS = [1_000, 5_000, 15_000] as const;

export type TimeRemainingBinId = "under-5-minutes" | "5-to-15-minutes";

export const TIME_REMAINING_BINS: readonly {
  binId: TimeRemainingBinId;
  minMsInclusive: number;
  maxMsExclusive: number;
  label: string;
}[] = [
  {
    binId: "under-5-minutes",
    minMsInclusive: 0,
    maxMsExclusive: 5 * 60_000,
    label: "< 5 minutes",
  },
  {
    binId: "5-to-15-minutes",
    minMsInclusive: 5 * 60_000,
    maxMsExclusive: 15 * 60_000,
    label: "5–15 minutes",
  },
] as const;

/**
 * Fixed same-direction convention (not searched):
 * sign(imbalance) predicts subsequent YES repricing in the same direction.
 */
export const DIRECTION_CONVENTION = "same-direction-as-imbalance-sign" as const;

export const DIRECTION_COUNT = 1 as const;

export const STRUCTURAL_CELL_COUNT =
  IMBALANCE_THRESHOLD_ABS.length
  * RESPONSE_HORIZONS_MS.length
  * TIME_REMAINING_BINS.length;

export const FAMILY_HYPOTHESIS_COUNT = STRUCTURAL_CELL_COUNT * DIRECTION_COUNT;

/**
 * Response-match tolerance for 1s/5s/15s horizons.
 * Lead-lag's 1500ms exceeds the shortest (1s) horizon and is inappropriate.
 * 250ms is below 1s, fixed (not searched), and binds into family identity.
 */
export const RESPONSE_MATCH_TOLERANCE_MS = 250 as const;

/** Fixed event-quote age eligibility gate (not a searched parameter). */
export const MAX_EVENT_QUOTE_AGE_MS = 2_000 as const;

/** Minimum refractory floor so overlapping response windows cannot pseudo-replicate. */
export const REFRACTORY_FLOOR_MS = 2_000 as const;

export const TIMESTAMP_POLICY = "kalshi-resolved-timestamp-ms" as const;

export const PRIMARY_EVENT_CLASS = "first-crossing-into-absolute-imbalance-threshold" as const;

export const EXPLICIT_EXCLUSIONS = [
  "BTC-conditioned features",
  "BTC volatility",
  "multi-level depth",
  "cancel/trade classification",
  "true liquidity-withdrawal claims",
  "size-drop impulse discovery",
  "spread-widening discovery",
  "spread × imbalance interactions",
  "fine implied-probability buckets",
  "settlement calibration",
  "historical discovery/ranking",
  "candidate promotion",
  "validation",
  "holdout",
  "preregistration",
  "prospective freeze",
  "new capture",
  "live trading",
  "lead-lag lineage reuse as confirmatory evidence",
] as const;

export class MicrostructureFamilyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MicrostructureFamilyError";
  }
}

export type ComplementBookSemantics = {
  capturedFields: readonly [
    "yesBestBidCents",
    "noBestBidCents",
    "yesBestBidSize",
    "noBestBidSize",
  ];
  derivedYesAskCentsRule: "100 - noBestBidCents";
  derivedYesAskSizeRule: "noBestBidSize";
  askSideIndependentlyCaptured: false;
  sizeDecreaseIsNotCancellationOrTradeOrWithdrawal: true;
  note: string;
};

export type ImbalanceFormulaSpec = {
  formula: "(yesBestBidSize - noBestBidSize) / (yesBestBidSize + noBestBidSize)";
  requireFinitePositiveDenominator: true;
  requireValidFiniteSizes: true;
};

export type DirectionConventionSpec = {
  convention: typeof DIRECTION_CONVENTION;
  directionCount: typeof DIRECTION_COUNT;
  positiveImbalanceImplies: "yes-price-expected-to-rise";
  negativeImbalanceImplies: "yes-price-expected-to-fall";
  note: string;
};

export type ResponseMatchContract = {
  timestampPolicy: typeof TIMESTAMP_POLICY;
  responseMatchToleranceMs: typeof RESPONSE_MATCH_TOLERANCE_MS;
  matchingRule: "first-quote-at-or-after-target-within-tolerance";
  missingResponseSemantics: "response-unobservable";
  missingResponseIsNotZeroMovement: true;
  leadLagToleranceNotReused: true;
  rationale: string;
};

export type EligibilityGates = {
  requireBookStateValid: true;
  requireEconomicallyValid: true;
  requireFinitePositiveSizesAndPrices: true;
  rejectAwaitingSnapshotResyncGap: true;
  maxEventQuoteAgeMs: typeof MAX_EVENT_QUOTE_AGE_MS;
  quoteAgeIsFixedGateNotSearched: true;
};

export type RefractoryPolicy = {
  rule: "R = max(H, 2000ms)";
  floorMs: typeof REFRACTORY_FLOOR_MS;
  note: string;
};

export type IndependentUnitPolicy = {
  primaryUnit: "one-qualifying-episode-per-marketTicker-per-calendar-day-per-structural-cell";
  blockKeyFormat: "${marketTicker}:${utcTradingDay}";
  rawQuoteCountIsNeverStatisticalN: true;
  reuseStack: "oosPowerCorrection.computeEffectiveSampleSizeEstimate";
  additionalSameMarketDayEpisodes: "diagnostic-incidence-only";
};

export type OutcomeSemantics = {
  diagnostic: "midpoint-response-cents";
  primaryEconomic: "executable-one-contract-response-or-horizon-pnl";
  evidenceQuality: "execution-observability";
  executableModel: "one-contract-tob-observable-bid-and-complement-ask";
  assumesFillBeyondDisplayedSize: false;
  feeTreatment: "gross-executable-unless-reusable-fee-infrastructure-bound; fee-adjusted support required before promotion";
  settlementIsPrimaryOutcome: false;
};

export type MicrostructureHypothesisCell = {
  hypothesisId: string;
  imbalanceThresholdAbs: (typeof IMBALANCE_THRESHOLD_ABS)[number];
  responseHorizonMs: (typeof RESPONSE_HORIZONS_MS)[number];
  timeRemainingBin: TimeRemainingBinId;
  directionConvention: typeof DIRECTION_CONVENTION;
};

export type MicrostructureFamilyDefinitionReport = {
  generatedAt: string;
  analysisVersion: typeof MICROSTRUCTURE_FAMILY_DEFINITION_VERSION;
  familyId: typeof MICROSTRUCTURE_FAMILY_ID;
  subfamilyId: typeof MICROSTRUCTURE_SUBFAMILY_ID;
  disclaimer: typeof MICROSTRUCTURE_FAMILY_DISCLAIMER;
  familyDefinitionIdentityHash: string;
  complementBookSemantics: ComplementBookSemantics;
  imbalanceFormula: ImbalanceFormulaSpec;
  imbalanceThresholdsAbs: readonly (typeof IMBALANCE_THRESHOLD_ABS)[number][];
  directionConvention: DirectionConventionSpec;
  responseHorizonsMs: readonly (typeof RESPONSE_HORIZONS_MS)[number][];
  timeRemainingBins: typeof TIME_REMAINING_BINS;
  primaryEventClass: typeof PRIMARY_EVENT_CLASS;
  responseMatchContract: ResponseMatchContract;
  eligibilityGates: EligibilityGates;
  refractoryPolicy: RefractoryPolicy;
  independentUnitPolicy: IndependentUnitPolicy;
  outcomeSemantics: OutcomeSemantics;
  searchUniverse: {
    structuralCellCount: typeof STRUCTURAL_CELL_COUNT;
    directionCount: typeof DIRECTION_COUNT;
    hypothesisCount: typeof FAMILY_HYPOTHESIS_COUNT;
    hypotheses: readonly MicrostructureHypothesisCell[];
  };
  explicitExclusions: typeof EXPLICIT_EXCLUSIONS;
  independenceFromLeadLag: true;
  btcFeaturesForbidden: true;
  quarantine: {
    historicalDiscoveryRun: false;
    rankingPerformed: false;
    promotionArtifactCreated: false;
    preregistrationArtifactCreated: false;
    frozenHypothesisCreated: false;
    validationRun: false;
    holdoutRun: false;
    captureStarted: false;
    liveOrdersExecuted: false;
  };
  outputPaths: {
    outputPath: string;
    htmlOutputPath: string;
  };
};

export type MicrostructureFamilyDefinitionConfig = {
  outputPath: string | null;
  htmlOutputPath: string | null;
};

/** Minimal TOB quote view for definition-time causal helpers (no BTC fields). */
export type TobImbalanceQuoteInput = {
  marketTicker: string;
  timestampMs: number;
  yesBestBidCents: number | null;
  noBestBidCents: number | null;
  yesBestBidSize: number | null;
  noBestBidSize: number | null;
  bookState: string | null;
  isEconomicallyValid: boolean | null;
  quoteAgeMs: number | null;
};

export type ResponseObservationResult =
  | {
      status: "observed";
      matchedQuoteTimestampMs: number;
      matchErrorMs: number;
      midpointResponseCents: number | null;
      executableBuyYesCents: number | null;
      executableSellYesCents: number | null;
    }
  | { status: "response-unobservable"; reason: string };
