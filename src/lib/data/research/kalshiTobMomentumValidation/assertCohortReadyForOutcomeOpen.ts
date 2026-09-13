import {
  buildMomentumValidationCohortPlan,
  deduplicateMomentumValidationCohortUnits,
  KNOWN_M140A_EVIDENCE_CONTRACT_IDENTITY,
  KNOWN_M140A_FAMILY_DEFINITION_IDENTITY,
  KNOWN_M140B_DISCOVERY_IDENTITY,
  LOCK_MOMENTUM_VALIDATION_CANDIDATE_ID,
  LOCKED_MOMENTUM_VALIDATION_CANDIDATE,
  MOMENTUM_VALIDATION_TARGET_ESS,
} from "../kalshiTobMomentumValidationCohort";

import {
  MomentumValidationError,
  type MomentumValidationCohortAuthorityInput,
  type MomentumValidationOutcomeAccessAuthorization,
} from "./momentumValidationTypes";

function recomputedPlanIdentity(): string {
  return buildMomentumValidationCohortPlan().planIdentity;
}

/**
 * Fail-closed gate: never authorize real/synthetic effect calculation unless
 * the cohort is exactly ready-for-outcome-open and all authority checks pass.
 */
export function authorizeMomentumValidationOutcomeAccess(
  input: MomentumValidationCohortAuthorityInput,
): MomentumValidationOutcomeAccessAuthorization {
  const accepted = input.acceptedSegments ?? input.registry.accepted;
  const acceptedSegmentCount = accepted.length;

  const dedup = deduplicateMomentumValidationCohortUnits(accepted);
  const cumulativeBlindEss =
    input.cumulativeBlindEss ?? dedup.deduplicatedCohortEss;

  const fail = (
    reason: string,
    disposition: "blocked" | "underpowered-no-peek" | "invalid-evidence",
    cohortStatus:
      | MomentumValidationCohortAuthorityInput["cohortStatus"]
      | "malformed" = input.cohortStatus,
  ): MomentumValidationOutcomeAccessAuthorization => ({
    authorized: false,
    reason,
    disposition,
    cumulativeBlindEss,
    acceptedSegmentCount,
    cohortStatus,
  });

  if (input.familyDefinitionIdentity !== KNOWN_M140A_FAMILY_DEFINITION_IDENTITY) {
    return fail(
      `Family identity mismatch: expected ${KNOWN_M140A_FAMILY_DEFINITION_IDENTITY}`,
      "invalid-evidence",
      "malformed",
    );
  }
  if (input.evidenceContractIdentity !== KNOWN_M140A_EVIDENCE_CONTRACT_IDENTITY) {
    return fail(
      `Evidence identity mismatch: expected ${KNOWN_M140A_EVIDENCE_CONTRACT_IDENTITY}`,
      "invalid-evidence",
      "malformed",
    );
  }
  if (input.discoveryIdentity !== KNOWN_M140B_DISCOVERY_IDENTITY) {
    return fail(
      `Discovery identity mismatch: expected ${KNOWN_M140B_DISCOVERY_IDENTITY}`,
      "invalid-evidence",
      "malformed",
    );
  }

  const expectedPlanIdentity = recomputedPlanIdentity();
  if (input.planIdentity !== expectedPlanIdentity) {
    return fail(
      `Cohort plan identity mismatch: expected ${expectedPlanIdentity}`,
      "invalid-evidence",
      "malformed",
    );
  }
  if (input.registry.planIdentity !== expectedPlanIdentity) {
    return fail(
      "Registry planIdentity must match recomputed cohort plan identity",
      "invalid-evidence",
      "malformed",
    );
  }

  if (input.lockedCandidateId !== LOCK_MOMENTUM_VALIDATION_CANDIDATE_ID) {
    return fail(
      `Locked candidate mismatch: expected ${LOCK_MOMENTUM_VALIDATION_CANDIDATE_ID}`,
      "invalid-evidence",
      "malformed",
    );
  }
  if (input.lockedCandidate) {
    const locked = input.lockedCandidate;
    if (
      locked.candidateId !== LOCK_MOMENTUM_VALIDATION_CANDIDATE_ID
      || locked.lookbackWindowMs !== LOCKED_MOMENTUM_VALIDATION_CANDIDATE.lookbackWindowMs
      || locked.thresholdCents !== LOCKED_MOMENTUM_VALIDATION_CANDIDATE.thresholdCents
      || locked.responseHorizonMs !== LOCKED_MOMENTUM_VALIDATION_CANDIDATE.responseHorizonMs
      || locked.direction !== LOCKED_MOMENTUM_VALIDATION_CANDIDATE.direction
    ) {
      return fail(
        "Locked candidate axes must exactly match sealed W-5000|X-2|H-30000|continuation",
        "invalid-evidence",
        "malformed",
      );
    }
  }

  for (const segment of accepted) {
    if (!segment.health.passed || !segment.health.topOfBookPresent) {
      return fail(
        `Admitted segment ${segment.runId} failed health / top-of-book gate`,
        "invalid-evidence",
        "malformed",
      );
    }
    if (segment.outcomesOpened !== false) {
      return fail(
        `Segment ${segment.runId} already has outcomesOpened=true; refuse re-open`,
        "invalid-evidence",
        "malformed",
      );
    }
    if (
      segment.contaminationClassification === "outcome-consumed-related-tob-price-response"
      || segment.contaminationClassification === "contaminated-train-only"
      || segment.contaminationClassification === "ineligible-validation"
    ) {
      return fail(
        `Contaminated / ineligible segment ${segment.runId} cannot authorize outcome open`,
        "invalid-evidence",
        "malformed",
      );
    }
  }

  if (input.cohortStatus === "underpowered-at-fixed-capture-budget") {
    return fail(
      "Cohort exhausted fixed capture budget underpowered; no outcome peek permitted",
      "underpowered-no-peek",
    );
  }

  if (input.cohortStatus === "continue-collection") {
    return fail(
      "Cohort still continue-collection; outcome access blocked",
      "blocked",
    );
  }

  if (input.cohortStatus !== "ready-for-outcome-open") {
    return fail(
      `Unknown / malformed cohort status: ${String(input.cohortStatus)}`,
      "invalid-evidence",
      "malformed",
    );
  }

  if (acceptedSegmentCount === 0) {
    return fail(
      "ready-for-outcome-open requires a non-empty accepted segments registry",
      "invalid-evidence",
      "malformed",
    );
  }

  if (cumulativeBlindEss < MOMENTUM_VALIDATION_TARGET_ESS) {
    return fail(
      `Deduplicated cumulativeBlindEss ${cumulativeBlindEss} < `
        + `target ${MOMENTUM_VALIDATION_TARGET_ESS}; outcome access blocked`,
      "blocked",
    );
  }

  return {
    authorized: true,
    disposition: "ready-for-outcome-open",
    cumulativeBlindEss,
    acceptedSegmentCount,
    planIdentity: expectedPlanIdentity,
    lockedCandidateId: LOCK_MOMENTUM_VALIDATION_CANDIDATE_ID,
  };
}

/**
 * Strict assert variant — throws unless authorized for outcome open.
 */
export function assertCohortReadyForOutcomeOpen(
  input: MomentumValidationCohortAuthorityInput,
): Extract<MomentumValidationOutcomeAccessAuthorization, { authorized: true }> {
  const result = authorizeMomentumValidationOutcomeAccess(input);
  if (!result.authorized) {
    throw new MomentumValidationError(
      `Outcome access denied (${result.disposition}): ${result.reason}`,
    );
  }
  return result;
}
