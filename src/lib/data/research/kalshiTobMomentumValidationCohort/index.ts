export {
  ORIGINAL_MOMENTUM_VALIDATION_COHORT_ANALYSIS_VERSION,
  ORIGINAL_MOMENTUM_VALIDATION_COHORT_PLAN_IDENTITY,
  MOMENTUM_VALIDATION_COHORT_ANALYSIS_VERSION,
  MOMENTUM_VALIDATION_COHORT_AMENDMENT_VERSION,
  MOMENTUM_VALIDATION_COHORT_AMENDMENT_REASON,
  MOMENTUM_VALIDATION_COHORT_DISCLAIMER,
  KNOWN_M140A_FAMILY_DEFINITION_IDENTITY,
  KNOWN_M140A_EVIDENCE_CONTRACT_IDENTITY,
  KNOWN_M140B_DISCOVERY_IDENTITY,
  LOCK_MOMENTUM_VALIDATION_CANDIDATE_ID,
  MOMENTUM_VALIDATION_SEGMENT_DURATION_MINUTES,
  MOMENTUM_VALIDATION_MAX_SEGMENT_DURATION_MINUTES,
  MOMENTUM_VALIDATION_STANDARD_FUTURE_SEGMENT_DURATION_MINUTES,
  MOMENTUM_VALIDATION_SEGMENT_1_GRANDFATHERED_DURATION_MINUTES,
  MOMENTUM_VALIDATION_TARGET_ESS,
  MOMENTUM_VALIDATION_MAX_ACCEPTED_SEGMENTS,
  MOMENTUM_VALIDATION_SEGMENT_COUNT_SAFETY_CAP,
  MOMENTUM_VALIDATION_MAX_CAPTURE_HOURS,
  MOMENTUM_VALIDATION_PRIOR_CONTAMINATED_RUN_IDS,
  FORBIDDEN_MOMENTUM_VALIDATION_OUTCOME_FIELD_NAMES,
  MomentumValidationCohortError,
} from "./momentumValidationCohortTypes";
export type {
  MomentumValidationBlindIncidence,
  MomentumValidationCohortPlan,
  MomentumValidationCohortPlanArtifact,
  MomentumValidationCohortStatus,
  MomentumValidationCohortDedupResult,
  MomentumValidationStoppingDecision,
  MomentumValidationAcceptedSegment,
  MomentumValidationExcludedSegment,
  MomentumValidationIndependentUnitRecord,
} from "./momentumValidationCohortTypes";

export {
  LOCKED_MOMENTUM_VALIDATION_CANDIDATE,
  assertPowerDesignMatchesSealedTarget,
  assertSealedMomentumIdentitiesMatchPreOpen,
  bindLockedMomentumValidationCandidate,
  hashMomentumValidationArtifact,
  sha256Hex,
} from "./lockedCandidateBinding";

export { buildMomentumValidationCohortPlan } from "./buildMomentumValidationCohortPlan";

export { assertNoValidationOutcomesOpenedBeforeSegmentationAmendment } from "./segmentationAmendmentGate";

export {
  assertValidMomentumValidationSegmentDuration,
  isValidMomentumValidationSegmentDuration,
  sumAcceptedCaptureHours,
} from "./segmentDurationPolicy";

export {
  assertHistoricalCannotSelfDeclareClean,
  assertRunEligibleForMomentumValidationCohort,
  createEmptyMomentumValidationCohortRegistry,
  registerMomentumValidationSegment,
} from "./reservationRegistry";
export type {
  MomentumValidationCohortRegistry,
  MomentumValidationReservationInput,
} from "./reservationRegistry";

export {
  accumulateStreamingBlindEpisodes,
  assertBlindIncidenceHasNoOutcomeFields,
  buildBlindIncidenceFromUnitKeys,
  buildBlindIncidenceWithMarketDayCap,
  buildMomentumIndependentUnitKey,
  parseMomentumIndependentUnitKey,
} from "./blindIncidenceCounter";

export { deduplicateMomentumValidationCohortUnits } from "./cohortEssDedup";

export {
  assertStoppingIgnoresSyntheticEffect,
  evaluateMomentumValidationStopping,
} from "./stoppingRule";

export {
  assertAdmittedValidationSegmentCannotBecomeHoldout,
  buildValidationHoldoutIsolationPolicy,
} from "./holdoutIsolation";

export {
  serializeMomentumValidationCohortPlanHtml,
  serializeMomentumValidationCohortPlanJson,
  serializeMomentumValidationCohortRegistryJson,
  serializeMomentumValidationStoppingJson,
} from "./serializeMomentumValidationCohort";
