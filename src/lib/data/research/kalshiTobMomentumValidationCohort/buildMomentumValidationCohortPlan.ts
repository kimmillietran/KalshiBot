import { buildIndependentUnitPolicy } from "../kalshiTobMomentumFamily";

import {
  hashMomentumValidationArtifact,
  LOCKED_MOMENTUM_VALIDATION_CANDIDATE,
  bindLockedMomentumValidationCandidate,
} from "./lockedCandidateBinding";
import {
  FORBIDDEN_MOMENTUM_VALIDATION_OUTCOME_FIELD_NAMES,
  KNOWN_M140B_DISCOVERY_IDENTITY,
  LOCK_MOMENTUM_VALIDATION_CANDIDATE_ID,
  MOMENTUM_VALIDATION_COHORT_AMENDMENT_REASON,
  MOMENTUM_VALIDATION_COHORT_AMENDMENT_VERSION,
  MOMENTUM_VALIDATION_COHORT_ANALYSIS_VERSION,
  MOMENTUM_VALIDATION_COHORT_DISCLAIMER,
  MOMENTUM_VALIDATION_MAX_CAPTURE_HOURS,
  MOMENTUM_VALIDATION_MAX_SEGMENT_DURATION_MINUTES,
  MOMENTUM_VALIDATION_MDE_CENTS,
  MOMENTUM_VALIDATION_OUTCOME_SD_CENTS,
  MOMENTUM_VALIDATION_POWER_ALPHA,
  MOMENTUM_VALIDATION_SEGMENT_1_GRANDFATHERED_DURATION_MINUTES,
  MOMENTUM_VALIDATION_SEGMENT_COUNT_SAFETY_CAP,
  MOMENTUM_VALIDATION_STANDARD_FUTURE_SEGMENT_DURATION_MINUTES,
  MOMENTUM_VALIDATION_TARGET_ESS,
  MOMENTUM_VALIDATION_TARGET_POWER,
  ORIGINAL_MOMENTUM_VALIDATION_COHORT_ANALYSIS_VERSION,
  ORIGINAL_MOMENTUM_VALIDATION_COHORT_PLAN_IDENTITY,
  type MomentumValidationCohortPlan,
  type MomentumValidationCohortPlanArtifact,
  MomentumValidationCohortError,
} from "./momentumValidationCohortTypes";
import { assertNoValidationOutcomesOpenedBeforeSegmentationAmendment } from "./segmentationAmendmentGate";

export function buildMomentumValidationCohortPlan(input?: {
  discoveryIdentity?: string;
  shortlistCandidateIds?: readonly string[];
  verifyPreOpenIdentities?: boolean;
  /**
   * Anti-shopping attestation. Any true flag fails closed — amendment must not
   * proceed after outcome access.
   */
  outcomeAccessAttestation?: {
    validationExecutablePnlComputed?: boolean;
    midpointContinuationComputed?: boolean;
    responseDirectionInspected?: boolean;
    validationEffectEstimateInspected?: boolean;
    pValueCalculated?: boolean;
  };
}): MomentumValidationCohortPlanArtifact {
  assertNoValidationOutcomesOpenedBeforeSegmentationAmendment(
    input?.outcomeAccessAttestation ?? {
      validationExecutablePnlComputed: false,
      midpointContinuationComputed: false,
      responseDirectionInspected: false,
      validationEffectEstimateInspected: false,
      pValueCalculated: false,
    },
  );

  const binding = bindLockedMomentumValidationCandidate({
    discoveryIdentity: input?.discoveryIdentity ?? KNOWN_M140B_DISCOVERY_IDENTITY,
    shortlistCandidateIds:
      input?.shortlistCandidateIds ?? [LOCK_MOMENTUM_VALIDATION_CANDIDATE_ID],
    verifyPreOpenIdentities: input?.verifyPreOpenIdentities,
  });

  const independentUnit = buildIndependentUnitPolicy();

  if (
    MOMENTUM_VALIDATION_STANDARD_FUTURE_SEGMENT_DURATION_MINUTES
      > MOMENTUM_VALIDATION_MAX_SEGMENT_DURATION_MINUTES
  ) {
    throw new MomentumValidationCohortError(
      "standard future segment duration cannot exceed max segment duration",
    );
  }
  if (
    MOMENTUM_VALIDATION_SEGMENT_1_GRANDFATHERED_DURATION_MINUTES
      > MOMENTUM_VALIDATION_MAX_SEGMENT_DURATION_MINUTES
  ) {
    throw new MomentumValidationCohortError(
      "grandfathered Segment 1 duration cannot exceed max segment duration",
    );
  }
  if (
    (MOMENTUM_VALIDATION_MAX_SEGMENT_DURATION_MINUTES / 60)
      * MOMENTUM_VALIDATION_SEGMENT_COUNT_SAFETY_CAP
    < MOMENTUM_VALIDATION_MAX_CAPTURE_HOURS
  ) {
    throw new MomentumValidationCohortError(
      "segment-count safety cap must not shorten the 40h accepted-time budget "
        + "under max-length (≤8h) segmentation",
    );
  }

  const plan: MomentumValidationCohortPlan = {
    analysisVersion: MOMENTUM_VALIDATION_COHORT_ANALYSIS_VERSION,
    disclaimer: MOMENTUM_VALIDATION_COHORT_DISCLAIMER,
    familyDefinitionIdentity: binding.familyDefinitionIdentity,
    evidenceContractIdentity: binding.evidenceContractIdentity,
    discoveryIdentity: binding.discoveryIdentity,
    lockedCandidateId: LOCK_MOMENTUM_VALIDATION_CANDIDATE_ID,
    lockedCandidate: {
      lookbackWindowMs: LOCKED_MOMENTUM_VALIDATION_CANDIDATE.lookbackWindowMs,
      thresholdCents: LOCKED_MOMENTUM_VALIDATION_CANDIDATE.thresholdCents,
      responseHorizonMs: LOCKED_MOMENTUM_VALIDATION_CANDIDATE.responseHorizonMs,
      direction: "continuation",
      candidateId: LOCK_MOMENTUM_VALIDATION_CANDIDATE_ID,
    },
    standardFutureSegmentDurationMinutes:
      MOMENTUM_VALIDATION_STANDARD_FUTURE_SEGMENT_DURATION_MINUTES,
    maxSegmentDurationMinutes: MOMENTUM_VALIDATION_MAX_SEGMENT_DURATION_MINUTES,
    segment1GrandfatheredDurationMinutes:
      MOMENTUM_VALIDATION_SEGMENT_1_GRANDFATHERED_DURATION_MINUTES,
    segmentDurationMinutes: MOMENTUM_VALIDATION_SEGMENT_1_GRANDFATHERED_DURATION_MINUTES,
    targetEss: MOMENTUM_VALIDATION_TARGET_ESS,
    maxAcceptedCaptureHours: MOMENTUM_VALIDATION_MAX_CAPTURE_HOURS,
    segmentCountSafetyCap: MOMENTUM_VALIDATION_SEGMENT_COUNT_SAFETY_CAP,
    maxAcceptedSegments: MOMENTUM_VALIDATION_SEGMENT_COUNT_SAFETY_CAP,
    powerDesign: {
      alpha: MOMENTUM_VALIDATION_POWER_ALPHA,
      targetPower: MOMENTUM_VALIDATION_TARGET_POWER,
      materialEffectCents: MOMENTUM_VALIDATION_MDE_CENTS,
      outcomeStandardDeviationCents: MOMENTUM_VALIDATION_OUTCOME_SD_CENTS,
      requiredEffectiveN: MOMENTUM_VALIDATION_TARGET_ESS,
      reusedFunction: "powerAnalysis.computeRequiredSampleSize",
    },
    independentUnitPolicy: {
      primaryUnit: independentUnit.primaryUnit,
      blockKeyFormat: "${marketTicker}:${utcTradingDay}:${candidateId}",
      crossSegmentDedup:
        "at-most-one-independent-unit-per-marketTicker-utcDay-candidateId-across-cohort",
    },
    acceptedSegmentCriteria: [
      "fresh-capture-not-previously-outcome-scored",
      "prospectively-reserved-for-validation-lineage-before-outcome-access",
      "exact-run-id-known",
      "capture-health-passed",
      "top-of-book-present",
      "compatible-kalshi-capture-semantics",
      "no-research-contamination",
      "no-prior-short-horizon-response-scoring",
      "outcomesOpened=false",
      "exact-content-identity-available",
      "capture-began-after-cohort-plan-freeze",
      "declared-duration-gt-0-and-lte-max-segment-duration",
    ],
    rejectedSegmentHandling: "preserve-in-excluded-lineage-do-not-consume-accepted-budget",
    blindCounterSchema: {
      fields: [
        "segmentRunId",
        "independentEss",
        "qualifyingEpisodeCount",
        "responseObservableCount",
        "executableObservableCount",
        "distinctMarkets",
        "distinctMarketDays",
        "outcomesOpened",
      ],
      forbiddenOutcomeFields: [...FORBIDDEN_MOMENTUM_VALIDATION_OUTCOME_FIELD_NAMES],
    },
    forbiddenInterimMetrics: [...FORBIDDEN_MOMENTUM_VALIDATION_OUTCOME_FIELD_NAMES],
    stoppingRule: {
      kind: "fixed-n-with-max-accepted-capture-hours",
      targetEss: MOMENTUM_VALIDATION_TARGET_ESS,
      maxAcceptedCaptureHours: MOMENTUM_VALIDATION_MAX_CAPTURE_HOURS,
      maxSegmentDurationMinutes: MOMENTUM_VALIDATION_MAX_SEGMENT_DURATION_MINUTES,
      evaluateOnlyAfterCompletedSegment: true,
      midSegmentOptionalStoppingForbidden: true,
      effectPeekingForbidden: true,
      pValueStoppingForbidden: true,
    },
    amendment: {
      version: MOMENTUM_VALIDATION_COHORT_AMENDMENT_VERSION,
      reason: MOMENTUM_VALIDATION_COHORT_AMENDMENT_REASON,
      priorAnalysisVersion: ORIGINAL_MOMENTUM_VALIDATION_COHORT_ANALYSIS_VERSION,
      priorPlanIdentity: ORIGINAL_MOMENTUM_VALIDATION_COHORT_PLAN_IDENTITY,
      noOutcomeAccessAssertion: true,
      segmentationOnly: true,
    },
    noOutcomeAccess: true,
    validationToHoldoutForeverForbidden: true,
    quarantine: {
      liveOrdersExecuted: false,
      promotionArtifactCreated: false,
      preregistrationArtifactCreated: false,
      holdoutOpened: false,
      validationOutcomesOpened: false,
    },
    authority: "content-addressed-not-latest-mtime",
  };

  const planIdentity = hashMomentumValidationArtifact(plan);
  if (planIdentity === ORIGINAL_MOMENTUM_VALIDATION_COHORT_PLAN_IDENTITY) {
    throw new MomentumValidationCohortError(
      "amended plan identity must not equal prior v1 plan identity",
    );
  }
  return { plan, planIdentity };
}
