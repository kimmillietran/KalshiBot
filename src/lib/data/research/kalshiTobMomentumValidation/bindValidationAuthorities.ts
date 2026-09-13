import type { MomentumCandidateDefinition } from "../momentumEvidenceContract";
import {
  assertSealedMomentumIdentitiesMatchPreOpen,
  bindLockedMomentumValidationCandidate,
  buildMomentumValidationCohortPlan,
  KNOWN_M140A_EVIDENCE_CONTRACT_IDENTITY,
  KNOWN_M140A_FAMILY_DEFINITION_IDENTITY,
  KNOWN_M140B_DISCOVERY_IDENTITY,
  LOCK_MOMENTUM_VALIDATION_CANDIDATE_ID,
  LOCKED_MOMENTUM_VALIDATION_CANDIDATE,
  MOMENTUM_VALIDATION_TARGET_ESS,
} from "../kalshiTobMomentumValidationCohort";

import {
  MOMENTUM_VALIDATION_MIN_EXECUTABLE_OBSERVABILITY_SHARE,
  MomentumValidationError,
  type MomentumValidationBoundAuthorities,
} from "./momentumValidationTypes";

/**
 * Bind exact M14.0a / M14.0b / M14.0c-prep authorities for validation evaluation.
 * Recomputes sealed identities and cohort plan identity; does not open outcomes.
 */
export function bindValidationAuthorities(input?: {
  discoveryIdentity?: string;
  shortlistCandidateIds?: readonly string[];
  verifyPreOpenIdentities?: boolean;
}): MomentumValidationBoundAuthorities {
  const discoveryIdentity = input?.discoveryIdentity ?? KNOWN_M140B_DISCOVERY_IDENTITY;
  const shortlistCandidateIds =
    input?.shortlistCandidateIds ?? [LOCK_MOMENTUM_VALIDATION_CANDIDATE_ID];

  const bound = bindLockedMomentumValidationCandidate({
    discoveryIdentity,
    shortlistCandidateIds,
    verifyPreOpenIdentities: input?.verifyPreOpenIdentities,
  });

  if (input?.verifyPreOpenIdentities !== false) {
    const sealed = assertSealedMomentumIdentitiesMatchPreOpen();
    if (sealed.familyDefinitionIdentity !== KNOWN_M140A_FAMILY_DEFINITION_IDENTITY) {
      throw new MomentumValidationError("Sealed family identity drift");
    }
    if (sealed.evidenceContractIdentity !== KNOWN_M140A_EVIDENCE_CONTRACT_IDENTITY) {
      throw new MomentumValidationError("Sealed evidence identity drift");
    }
    if (sealed.requiredEffectiveN !== MOMENTUM_VALIDATION_TARGET_ESS) {
      throw new MomentumValidationError("Sealed ESS drift");
    }
  }

  const { planIdentity } = buildMomentumValidationCohortPlan({
    discoveryIdentity: bound.discoveryIdentity,
    shortlistCandidateIds,
    verifyPreOpenIdentities: input?.verifyPreOpenIdentities,
  });

  const lockedCandidate: MomentumCandidateDefinition = {
    candidateId: LOCKED_MOMENTUM_VALIDATION_CANDIDATE.candidateId,
    hypothesisId: LOCKED_MOMENTUM_VALIDATION_CANDIDATE.candidateId,
    lookbackWindowMs: LOCKED_MOMENTUM_VALIDATION_CANDIDATE.lookbackWindowMs,
    thresholdCents: LOCKED_MOMENTUM_VALIDATION_CANDIDATE.thresholdCents,
    responseHorizonMs: LOCKED_MOMENTUM_VALIDATION_CANDIDATE.responseHorizonMs,
    direction: LOCKED_MOMENTUM_VALIDATION_CANDIDATE.direction,
    discoveryRank: 0,
  };

  if (lockedCandidate.candidateId !== LOCK_MOMENTUM_VALIDATION_CANDIDATE_ID) {
    throw new MomentumValidationError("Locked candidate id construction failed");
  }

  return {
    familyDefinitionIdentity: KNOWN_M140A_FAMILY_DEFINITION_IDENTITY,
    evidenceContractIdentity: KNOWN_M140A_EVIDENCE_CONTRACT_IDENTITY,
    discoveryIdentity: KNOWN_M140B_DISCOVERY_IDENTITY,
    planIdentity,
    lockedCandidateId: LOCK_MOMENTUM_VALIDATION_CANDIDATE_ID,
    lockedCandidate,
    minEssForValidation: MOMENTUM_VALIDATION_TARGET_ESS,
    minExecutableObservabilityShare: MOMENTUM_VALIDATION_MIN_EXECUTABLE_OBSERVABILITY_SHARE,
  };
}
