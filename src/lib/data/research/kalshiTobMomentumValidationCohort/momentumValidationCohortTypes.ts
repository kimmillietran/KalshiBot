import {
  PRIOR_LEAD_LAG_HOLDOUT_RUN_ID,
  PRIOR_LEAD_LAG_TRAIN_RUN_ID,
  PRIOR_LEAD_LAG_VALIDATION_RUN_ID,
} from "../momentumEvidenceContract";

/**
 * M14.0c-prep — Prospective momentum validation cohort governance.
 * Outcome-blind: never compute validation P&L, midpoint continuation, signed
 * response, direction consistency, or p-values.
 *
 * Cohort plan v1.1 amends operational segmentation only (flexible segment
 * durations up to 480 minutes; 40h accepted-time budget). No validation
 * outcomes may be opened before or during this amendment.
 */

export const ORIGINAL_MOMENTUM_VALIDATION_COHORT_ANALYSIS_VERSION =
  "momentum-validation-cohort-plan-v1" as const;

/** Content-addressed identity of the sealed v1 cohort plan (immutable lineage). */
export const ORIGINAL_MOMENTUM_VALIDATION_COHORT_PLAN_IDENTITY =
  "a54f4a8c6f3727ad1618c9b270d904cb236bad1c05a4d4d5f9c61359ac4eec84" as const;

export const MOMENTUM_VALIDATION_COHORT_ANALYSIS_VERSION =
  "momentum-validation-cohort-plan-v1.1" as const;

export const MOMENTUM_VALIDATION_COHORT_AMENDMENT_VERSION = "1.1" as const;

export const MOMENTUM_VALIDATION_COHORT_AMENDMENT_REASON =
  "operational segmentation only; no validation outcomes opened" as const;

export const MOMENTUM_VALIDATION_COHORT_DISCLAIMER =
  "M14.0c-prep seals the prospective momentum validation cohort plan (v1.1), "
  + "reservation registry, outcome-blind incidence/ESS counter, and fixed-N "
  + "stopping rule (ESS target + accepted capture-time budget) only. "
  + "It does not open validation outcomes, compute P&L/continuation, evaluate "
  + "candidate validation status, lock holdout, promote, freeze, or place live orders.";

/** Sealed M14.0b TRAIN discovery identity (content-addressed authority). */
export const KNOWN_M140B_DISCOVERY_IDENTITY =
  "7a05a2dadd2ec21c382f52ebe804bf606ac3df0b6cb69194b3e6af9ce1abeaee" as const;

/** Sealed M14.0a family-definition identity (verify via sealMomentumPreOpenBundle). */
export const KNOWN_M140A_FAMILY_DEFINITION_IDENTITY =
  "764fd36d67f8152077666119ddd1049bcd6940d259f21b60ec7138fa3ad4795d" as const;

/** Sealed M14.0b-prep evidence-contract identity (verify via sealMomentumPreOpenBundle). */
export const KNOWN_M140A_EVIDENCE_CONTRACT_IDENTITY =
  "97c310c929733a92d4e3aa460b85e58d406f1888ed8f24ea43a4c0b69d24dee7" as const;

export const LOCK_MOMENTUM_VALIDATION_CANDIDATE_ID =
  "W-5000|X-2|H-30000|continuation" as const;

/** @deprecated Prefer max/standard/grandfathered duration constants (v1.1). */
export const MOMENTUM_VALIDATION_SEGMENT_DURATION_MINUTES = 300 as const;

export const MOMENTUM_VALIDATION_MAX_SEGMENT_DURATION_MINUTES = 480 as const;
export const MOMENTUM_VALIDATION_STANDARD_FUTURE_SEGMENT_DURATION_MINUTES =
  480 as const;
export const MOMENTUM_VALIDATION_SEGMENT_1_GRANDFATHERED_DURATION_MINUTES =
  300 as const;

export const MOMENTUM_VALIDATION_TARGET_ESS = 155 as const;
export const MOMENTUM_VALIDATION_MAX_CAPTURE_HOURS = 40 as const;

/**
 * Optional segment-count safety ceiling only. Must not shorten the 40h budget
 * under valid ≤8h segmentation: floor(40h / (300m/60)) = 8 when using the
 * grandfathered 5h size; with 8h segments the time budget binds first.
 * Stopping is driven by ESS and accepted capture hours, not this count.
 */
export const MOMENTUM_VALIDATION_SEGMENT_COUNT_SAFETY_CAP = 8 as const;

/** @deprecated Alias retained for imports; stopping no longer uses segment count. */
export const MOMENTUM_VALIDATION_MAX_ACCEPTED_SEGMENTS =
  MOMENTUM_VALIDATION_SEGMENT_COUNT_SAFETY_CAP;

export const MOMENTUM_VALIDATION_POWER_ALPHA = 0.05 as const;
export const MOMENTUM_VALIDATION_TARGET_POWER = 0.8 as const;
export const MOMENTUM_VALIDATION_MDE_CENTS = 2 as const;
export const MOMENTUM_VALIDATION_OUTCOME_SD_CENTS = 10 as const;

/** Prior contaminated research runs — never admit into validation cohort. */
export const MOMENTUM_VALIDATION_PRIOR_CONTAMINATED_RUN_IDS = [
  PRIOR_LEAD_LAG_TRAIN_RUN_ID,
  PRIOR_LEAD_LAG_VALIDATION_RUN_ID,
  PRIOR_LEAD_LAG_HOLDOUT_RUN_ID,
] as const;

export const FORBIDDEN_MOMENTUM_VALIDATION_OUTCOME_FIELD_NAMES = [
  "responseCents",
  "responseSign",
  "responsePriceChange",
  "pnl",
  "signedPnl",
  "grossPnl",
  "grossExecutablePnlCents",
  "feeAdjustedPnl",
  "midpointDelta",
  "midpointContinuationCents",
  "signedMidpointContinuationCents",
  "signedExecutableMeanCents",
  "signedExecutableMedianCents",
  "signedMidpointMeanCents",
  "signedMidpointMedianCents",
  "median",
  "mean",
  "positiveShare",
  "directionalResponseShare",
  "directionConsistency",
  "directionConsistentWithFamily",
  "pValue",
  "effectConfidenceInterval",
  "validationStatus",
  "candidateValidationStatus",
] as const;

export type ForbiddenMomentumValidationOutcomeFieldName =
  (typeof FORBIDDEN_MOMENTUM_VALIDATION_OUTCOME_FIELD_NAMES)[number];

export class MomentumValidationCohortError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MomentumValidationCohortError";
  }
}

export type MomentumValidationCohortStatus =
  | "continue-collection"
  | "ready-for-outcome-open"
  | "underpowered-at-fixed-capture-budget";

export type MomentumValidationBlindIncidence = {
  segmentRunId: string;
  independentEss: number;
  qualifyingEpisodeCount: number;
  responseObservableCount: number;
  executableObservableCount: number;
  distinctMarkets: number;
  distinctMarketDays: number;
  outcomesOpened: false;
};

export type MomentumValidationIndependentUnitRecord = {
  unitId: string;
  marketTicker: string;
  tradingDayUtc: string;
  candidateId: string;
  observedInRunId: string;
  responseObservable: boolean;
  executableObservable: boolean;
};

export type MomentumValidationSegmentHealth = {
  passed: boolean;
  verdict: string | null;
  topOfBookPresent: boolean;
  failureReasons: readonly string[];
};

export type MomentumValidationSegmentReservation = {
  runId: string;
  captureRunDir: string;
  captureStartMs: number;
  captureEndMs: number | null;
  durationMinutes: number | null;
  captureIdentityHash: string;
  health: MomentumValidationSegmentHealth;
  captureEndReason: string | null;
  configIdentity: string | null;
  priorResearchRoles: readonly string[];
  contaminationClassification: string;
  intendedCohortPosition: number | null;
  outcomesOpened: false;
  reservedForValidationLineage: true;
  reservedAfterPlanFreeze: true;
  planIdentity: string;
  reservationAttestationHash: string;
};

export type MomentumValidationAcceptedSegment = MomentumValidationSegmentReservation & {
  accepted: true;
  blindIncidence: MomentumValidationBlindIncidence;
  independentUnitIds: readonly string[];
};

export type MomentumValidationExcludedSegment = MomentumValidationSegmentReservation & {
  accepted: false;
  exclusionReason: string;
};

export type MomentumValidationCohortPlan = {
  analysisVersion: typeof MOMENTUM_VALIDATION_COHORT_ANALYSIS_VERSION;
  disclaimer: typeof MOMENTUM_VALIDATION_COHORT_DISCLAIMER;
  familyDefinitionIdentity: string;
  evidenceContractIdentity: string;
  discoveryIdentity: typeof KNOWN_M140B_DISCOVERY_IDENTITY;
  lockedCandidateId: typeof LOCK_MOMENTUM_VALIDATION_CANDIDATE_ID;
  lockedCandidate: {
    lookbackWindowMs: 5000;
    thresholdCents: 2;
    responseHorizonMs: 30000;
    direction: "continuation";
    candidateId: typeof LOCK_MOMENTUM_VALIDATION_CANDIDATE_ID;
  };
  /** Standard duration for newly launched segments (v1.1). */
  standardFutureSegmentDurationMinutes: typeof MOMENTUM_VALIDATION_STANDARD_FUTURE_SEGMENT_DURATION_MINUTES;
  maxSegmentDurationMinutes: typeof MOMENTUM_VALIDATION_MAX_SEGMENT_DURATION_MINUTES;
  segment1GrandfatheredDurationMinutes: typeof MOMENTUM_VALIDATION_SEGMENT_1_GRANDFATHERED_DURATION_MINUTES;
  /**
   * @deprecated v1 field retained as alias of grandfathered Segment 1 duration
   * for readability; not the exclusive allowed duration.
   */
  segmentDurationMinutes: typeof MOMENTUM_VALIDATION_SEGMENT_1_GRANDFATHERED_DURATION_MINUTES;
  targetEss: typeof MOMENTUM_VALIDATION_TARGET_ESS;
  maxAcceptedCaptureHours: typeof MOMENTUM_VALIDATION_MAX_CAPTURE_HOURS;
  /** Safety ceiling only; stopping uses accepted capture hours. */
  segmentCountSafetyCap: typeof MOMENTUM_VALIDATION_SEGMENT_COUNT_SAFETY_CAP;
  /** @deprecated Prefer segmentCountSafetyCap; not used for stopping in v1.1. */
  maxAcceptedSegments: typeof MOMENTUM_VALIDATION_SEGMENT_COUNT_SAFETY_CAP;
  powerDesign: {
    alpha: typeof MOMENTUM_VALIDATION_POWER_ALPHA;
    targetPower: typeof MOMENTUM_VALIDATION_TARGET_POWER;
    materialEffectCents: typeof MOMENTUM_VALIDATION_MDE_CENTS;
    outcomeStandardDeviationCents: typeof MOMENTUM_VALIDATION_OUTCOME_SD_CENTS;
    requiredEffectiveN: typeof MOMENTUM_VALIDATION_TARGET_ESS;
    reusedFunction: "powerAnalysis.computeRequiredSampleSize";
  };
  independentUnitPolicy: {
    primaryUnit: "one-qualifying-episode-per-marketTicker-per-utc-calendar-day-per-structural-cell";
    blockKeyFormat: "${marketTicker}:${utcTradingDay}:${candidateId}";
    crossSegmentDedup: "at-most-one-independent-unit-per-marketTicker-utcDay-candidateId-across-cohort";
  };
  acceptedSegmentCriteria: readonly string[];
  rejectedSegmentHandling: "preserve-in-excluded-lineage-do-not-consume-accepted-budget";
  blindCounterSchema: {
    fields: readonly (keyof MomentumValidationBlindIncidence)[];
    forbiddenOutcomeFields: readonly ForbiddenMomentumValidationOutcomeFieldName[];
  };
  forbiddenInterimMetrics: readonly ForbiddenMomentumValidationOutcomeFieldName[];
  stoppingRule: {
    kind: "fixed-n-with-max-accepted-capture-hours";
    targetEss: typeof MOMENTUM_VALIDATION_TARGET_ESS;
    maxAcceptedCaptureHours: typeof MOMENTUM_VALIDATION_MAX_CAPTURE_HOURS;
    maxSegmentDurationMinutes: typeof MOMENTUM_VALIDATION_MAX_SEGMENT_DURATION_MINUTES;
    evaluateOnlyAfterCompletedSegment: true;
    midSegmentOptionalStoppingForbidden: true;
    effectPeekingForbidden: true;
    pValueStoppingForbidden: true;
  };
  amendment: {
    version: typeof MOMENTUM_VALIDATION_COHORT_AMENDMENT_VERSION;
    reason: typeof MOMENTUM_VALIDATION_COHORT_AMENDMENT_REASON;
    priorAnalysisVersion: typeof ORIGINAL_MOMENTUM_VALIDATION_COHORT_ANALYSIS_VERSION;
    priorPlanIdentity: typeof ORIGINAL_MOMENTUM_VALIDATION_COHORT_PLAN_IDENTITY;
    noOutcomeAccessAssertion: true;
    segmentationOnly: true;
  };
  noOutcomeAccess: true;
  validationToHoldoutForeverForbidden: true;
  quarantine: {
    liveOrdersExecuted: false;
    promotionArtifactCreated: false;
    preregistrationArtifactCreated: false;
    holdoutOpened: false;
    validationOutcomesOpened: false;
  };
  authority: "content-addressed-not-latest-mtime";
};

export type MomentumValidationCohortPlanArtifact = {
  plan: MomentumValidationCohortPlan;
  planIdentity: string;
};

export type MomentumValidationCohortDedupResult = {
  rawPerSegmentEssSum: number;
  deduplicatedCohortEss: number;
  duplicateOrDependentUnitsRemoved: number;
  retainedUnitIds: readonly string[];
  removedUnitIds: readonly string[];
};

export type MomentumValidationStoppingDecision = {
  status: MomentumValidationCohortStatus;
  cumulativeBlindEss: number;
  cumulativeAcceptedCaptureHours: number;
  acceptedSegmentCount: number;
  targetEss: typeof MOMENTUM_VALIDATION_TARGET_ESS;
  maxAcceptedCaptureHours: typeof MOMENTUM_VALIDATION_MAX_CAPTURE_HOURS;
  remainingAcceptedCaptureHours: number;
  effectPeekingForbidden: true;
  pValueStoppingForbidden: true;
  syntheticEffectIgnored: true;
};
