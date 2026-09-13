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
  MOMENTUM_VALIDATION_COHORT_ANALYSIS_VERSION,
  MOMENTUM_VALIDATION_COHORT_DISCLAIMER,
  MOMENTUM_VALIDATION_MAX_ACCEPTED_SEGMENTS,
  MOMENTUM_VALIDATION_MAX_CAPTURE_HOURS,
  MOMENTUM_VALIDATION_MDE_CENTS,
  MOMENTUM_VALIDATION_OUTCOME_SD_CENTS,
  MOMENTUM_VALIDATION_POWER_ALPHA,
  MOMENTUM_VALIDATION_SEGMENT_DURATION_MINUTES,
  MOMENTUM_VALIDATION_TARGET_ESS,
  MOMENTUM_VALIDATION_TARGET_POWER,
  type MomentumValidationCohortPlan,
  type MomentumValidationCohortPlanArtifact,
  MomentumValidationCohortError,
} from "./momentumValidationCohortTypes";

export function buildMomentumValidationCohortPlan(input?: {
  discoveryIdentity?: string;
  shortlistCandidateIds?: readonly string[];
  verifyPreOpenIdentities?: boolean;
}): MomentumValidationCohortPlanArtifact {
  const binding = bindLockedMomentumValidationCandidate({
    discoveryIdentity: input?.discoveryIdentity ?? KNOWN_M140B_DISCOVERY_IDENTITY,
    shortlistCandidateIds:
      input?.shortlistCandidateIds ?? [LOCK_MOMENTUM_VALIDATION_CANDIDATE_ID],
    verifyPreOpenIdentities: input?.verifyPreOpenIdentities,
  });

  const independentUnit = buildIndependentUnitPolicy();
  const maxHours =
    (MOMENTUM_VALIDATION_SEGMENT_DURATION_MINUTES / 60)
    * MOMENTUM_VALIDATION_MAX_ACCEPTED_SEGMENTS;
  if (maxHours !== MOMENTUM_VALIDATION_MAX_CAPTURE_HOURS) {
    throw new MomentumValidationCohortError(
      `Max capture hours must equal ${MOMENTUM_VALIDATION_MAX_CAPTURE_HOURS} `
        + `(${MOMENTUM_VALIDATION_MAX_ACCEPTED_SEGMENTS} × `
        + `${MOMENTUM_VALIDATION_SEGMENT_DURATION_MINUTES / 60}h); got ${maxHours}`,
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
    segmentDurationMinutes: MOMENTUM_VALIDATION_SEGMENT_DURATION_MINUTES,
    targetEss: MOMENTUM_VALIDATION_TARGET_ESS,
    maxAcceptedSegments: MOMENTUM_VALIDATION_MAX_ACCEPTED_SEGMENTS,
    maxAcceptedCaptureHours: MOMENTUM_VALIDATION_MAX_CAPTURE_HOURS,
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
      kind: "fixed-n-with-max-accepted-segments",
      targetEss: MOMENTUM_VALIDATION_TARGET_ESS,
      maxAcceptedSegments: MOMENTUM_VALIDATION_MAX_ACCEPTED_SEGMENTS,
      evaluateOnlyAfterCompletedSegment: true,
      effectPeekingForbidden: true,
      pValueStoppingForbidden: true,
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
  return { plan, planIdentity };
}
