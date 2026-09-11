/**
 * M14.0a — Governed Kalshi-native TOB midpoint momentum family definition.
 *
 * Definition / causal-feature infrastructure only. No historical discovery.
 * This is Kalshi own-price momentum — not BTC recentMomentum, atlas buckets,
 * or simpleMomentumStrategyPlugin.
 */

export const MOMENTUM_FAMILY_ID = "momentum" as const;
export const MOMENTUM_SUBFAMILY_ID =
  "kalshi-tob-mid-return-threshold-continuation-v1" as const;

export const MOMENTUM_FAMILY_DEFINITION_VERSION =
  "kalshi-tob-momentum-family-definition-v1" as const;

export const MOMENTUM_FAMILY_DISCLAIMER =
  "M14.0a defines the governed Kalshi-native TOB midpoint momentum family only "
  + "(kalshi-tob-mid-return-threshold-continuation-v1). "
  + "It does not run TRAIN discovery, validation, holdout, backtests, ranking, "
  + "promotion, preregistration, prospective freeze, capture, or live trading. "
  + "This is Kalshi own-price momentum — not BTC momentum, lead-lag, TOB imbalance, "
  + "reversal search, or settlement calibration. Fee-adjusted/net P&L is unbound.";

export const DEFAULT_MOMENTUM_FAMILY_JSON_ROOT =
  "data/research-results/momentum/family-definition" as const;
export const DEFAULT_MOMENTUM_FAMILY_HTML_ROOT =
  "data/reports/momentum/family-definition" as const;
export const MOMENTUM_FAMILY_JSON_FILENAME =
  "kalshi-tob-momentum-family-definition.json" as const;
export const MOMENTUM_FAMILY_HTML_FILENAME =
  "kalshi-tob-momentum-family-definition.html" as const;

/** Backward clock windows (ms) — frozen; not quote-count windows. */
export const BACKWARD_WINDOWS_MS = [5_000, 15_000] as const;

/** Absolute midpoint return thresholds in cents — frozen discrete set. */
export const RETURN_THRESHOLDS_CENTS = [2, 3] as const;

/** Forward response horizons (ms) — frozen; no 1s. */
export const FORWARD_HORIZONS_MS = [5_000, 15_000, 30_000] as const;

/**
 * Fixed continuation-only direction (not searched):
 * sign(backwardReturn) predicts same-sign forward midpoint/executable continuation.
 */
export const DIRECTION_CONVENTION = "continuation" as const;
export const DIRECTION_COUNT = 1 as const;

export const STRUCTURAL_CELL_COUNT =
  BACKWARD_WINDOWS_MS.length
  * RETURN_THRESHOLDS_CENTS.length
  * FORWARD_HORIZONS_MS.length;

export const FAMILY_HYPOTHESIS_COUNT = STRUCTURAL_CELL_COUNT * DIRECTION_COUNT;

/** Anchor must be within this tolerance of target backward time t−W. */
export const ANCHOR_MATCH_TOLERANCE_MS = 250 as const;

/** Response quote must fall in [t+H, t+H+tolerance]. */
export const RESPONSE_MATCH_TOLERANCE_MS = 250 as const;

/** Fixed event-quote age eligibility gate (research-grade authority). */
export const MAX_EVENT_QUOTE_AGE_MS = 2_000 as const;

export const REFRACTORY_FLOOR_MS = 2_000 as const;

export const TIMESTAMP_POLICY = "kalshi-resolved-timestamp-ms" as const;

export const PRIMARY_EVENT_CLASS =
  "first-crossing-into-absolute-backward-mid-return-threshold" as const;

/** Fixed probability gate — eligibility only, not a search axis. */
export const PROBABILITY_GATE_MIN_MID_CENTS = 15 as const;
export const PROBABILITY_GATE_MAX_MID_CENTS = 85 as const;

/** Fixed time-remaining gate — eligibility only; no time bins in v1. */
export const TIME_REMAINING_MAX_MS = 15 * 60_000;
export const TIME_REMAINING_RESPONSE_ROOM_BUFFER_MS = 5_000;

export const MIDPOINT_FORMULA =
  "yesMidCents = (yesBestBidCents + (100 - noBestBidCents)) / 2" as const;

export const EXPLICIT_EXCLUSIONS = [
  "BTC/external momentum",
  "BTC conditioning or volatility",
  "reversal search",
  "TOB size imbalance",
  "multi-level depth",
  "cancel/trade inference",
  "settlement as primary short-horizon outcome",
  "ML / continuous optimization",
  "extra W/X/H values beyond frozen sets",
  "probability grids / buckets as search axes",
  "hour / volatility / spread grids",
  "legacy recentMomentum / atlas BTC momentum buckets as family authority",
  "simpleMomentumStrategyPlugin as family authority",
  "TRAIN discovery",
  "shortlist / validation / holdout",
  "promotion",
  "preregistration",
  "prospective freeze",
  "new capture",
  "live trading",
  "fee-adjusted net edge without bound fee contract",
] as const;

export class MomentumFamilyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MomentumFamilyError";
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
  derivedNoAskCentsRule: "100 - yesBestBidCents";
  derivedYesAskSizeRule: "noBestBidSize";
  askSideIndependentlyCaptured: false;
  note: string;
};

export type MidpointFormulaSpec = {
  formula: typeof MIDPOINT_FORMULA;
  equivalentForm: "50 + (yesBestBidCents - noBestBidCents) / 2";
  units: "cents";
};

export type DirectionConventionSpec = {
  convention: typeof DIRECTION_CONVENTION;
  directionCount: typeof DIRECTION_COUNT;
  positiveBackwardReturnImplies: "positive-forward-continuation";
  negativeBackwardReturnImplies: "negative-forward-continuation";
  reversalSearched: false;
  note: string;
};

export type AnchorPolicy = {
  rule: "last-eligible-quote-with-timestamp-at-or-before-t-minus-W";
  targetOffsetMs: "W";
  matchToleranceMs: typeof ANCHOR_MATCH_TOLERANCE_MS;
  failClosedIfMissing: true;
  failClosedIfMismatchBeyondTolerance: true;
  noQuoteAfterEventMayAffectPredictor: true;
};

export type ResponseMatchContract = {
  timestampPolicy: typeof TIMESTAMP_POLICY;
  responseMatchToleranceMs: typeof RESPONSE_MATCH_TOLERANCE_MS;
  matchingRule: "first-eligible-quote-in-[t+H, t+H+tolerance]-strictly-after-t";
  missingResponseSemantics: "response-unobservable";
  missingResponseIsNotZeroMovement: true;
};

export type EligibilityGates = {
  requireBookStateValid: true;
  requireEconomicallyValid: true;
  rejectAwaitingSnapshotResyncGap: true;
  maxEventQuoteAgeMs: typeof MAX_EVENT_QUOTE_AGE_MS;
  quoteAgeIsFixedGateNotSearched: true;
  probabilityGateMinMidCents: typeof PROBABILITY_GATE_MIN_MID_CENTS;
  probabilityGateMaxMidCents: typeof PROBABILITY_GATE_MAX_MID_CENTS;
  timeRemainingMaxMs: typeof TIME_REMAINING_MAX_MS;
  timeRemainingRequiresHorizonPlusBufferMs: typeof TIME_REMAINING_RESPONSE_ROOM_BUFFER_MS;
  probabilityAndTimeAreGatesNotSearchAxes: true;
};

export type RefractoryPolicy = {
  rule: "R = max(H, 2000ms)";
  floorMs: typeof REFRACTORY_FLOOR_MS;
  note: string;
};

export type IndependentUnitPolicy = {
  primaryUnit: "one-qualifying-episode-per-marketTicker-per-utc-calendar-day-per-structural-cell";
  blockKeyFormat: "${marketTicker}:${utcTradingDay}:${structuralCellId}";
  rawQuoteCountIsNeverStatisticalN: true;
  multipleHorizonsFromOneCrossingAreCorrelatedHypotheses: true;
  additionalSameMarketDayEpisodes: "diagnostic-incidence-only";
};

export type OutcomeSemantics = {
  diagnostic: "signed-midpoint-continuation-cents";
  primaryEconomic: "gross-one-contract-executable-horizon-pnl-cents";
  feeAdjustedNet: "requires-separately-bound-deterministic-fee-contract";
  feeContractBound: false;
  assumesFillBeyondDisplayedSize: false;
  settlementIsPrimaryOutcome: false;
};

export type MomentumHypothesisCell = {
  hypothesisId: string;
  backwardWindowMs: (typeof BACKWARD_WINDOWS_MS)[number];
  returnThresholdCents: (typeof RETURN_THRESHOLDS_CENTS)[number];
  forwardHorizonMs: (typeof FORWARD_HORIZONS_MS)[number];
  directionConvention: typeof DIRECTION_CONVENTION;
};

export type MomentumFamilyDefinitionReport = {
  generatedAt: string;
  analysisVersion: typeof MOMENTUM_FAMILY_DEFINITION_VERSION;
  familyId: typeof MOMENTUM_FAMILY_ID;
  subfamilyId: typeof MOMENTUM_SUBFAMILY_ID;
  disclaimer: typeof MOMENTUM_FAMILY_DISCLAIMER;
  familyDefinitionIdentityHash: string;
  scientificLabel: "Kalshi own-price momentum";
  notToBeConfusedWith: readonly string[];
  complementBookSemantics: ComplementBookSemantics;
  midpointFormula: MidpointFormulaSpec;
  directionConvention: DirectionConventionSpec;
  backwardWindowsMs: readonly (typeof BACKWARD_WINDOWS_MS)[number][];
  returnThresholdsCents: readonly (typeof RETURN_THRESHOLDS_CENTS)[number][];
  forwardHorizonsMs: readonly (typeof FORWARD_HORIZONS_MS)[number][];
  primaryEventClass: typeof PRIMARY_EVENT_CLASS;
  anchorPolicy: AnchorPolicy;
  responseMatchContract: ResponseMatchContract;
  eligibilityGates: EligibilityGates;
  refractoryPolicy: RefractoryPolicy;
  independentUnitPolicy: IndependentUnitPolicy;
  outcomeSemantics: OutcomeSemantics;
  searchUniverse: {
    structuralCellCount: typeof STRUCTURAL_CELL_COUNT;
    directionCount: typeof DIRECTION_COUNT;
    hypothesisCount: typeof FAMILY_HYPOTHESIS_COUNT;
    hypotheses: readonly MomentumHypothesisCell[];
  };
  explicitExclusions: typeof EXPLICIT_EXCLUSIONS;
  btcFeaturesForbidden: true;
  quarantine: {
    historicalMomentumOutcomesRead: false;
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

export type MomentumFamilyDefinitionConfig = {
  outputPath: string | null;
  htmlOutputPath: string | null;
};

/** Minimal Kalshi TOB quote view for definition-time helpers (no BTC fields). */
export type MomentumQuoteInput = {
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
      midpointCents: number | null;
      executableBuyYesCents: number | null;
      executableSellYesCents: number | null;
    }
  | { status: "response-unobservable"; reason: string };
