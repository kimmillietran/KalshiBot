import { createHash } from "node:crypto";

import { buildHypothesisId } from "../kalshiTobMomentumFamily";
import { sealMomentumPreOpenBundle } from "../kalshiTobMomentumDiscovery/preOpenGate";
import {
  deriveMomentumRequiredEffectiveN,
  MOMENTUM_DEFAULT_ALPHA,
  MOMENTUM_DEFAULT_OUTCOME_SD_CENTS,
  MOMENTUM_DEFAULT_TARGET_POWER,
} from "../momentumEvidenceContract";
import { stableStringify } from "@/lib/trading/config/hashConfig";

import {
  KNOWN_M140A_EVIDENCE_CONTRACT_IDENTITY,
  KNOWN_M140A_FAMILY_DEFINITION_IDENTITY,
  KNOWN_M140B_DISCOVERY_IDENTITY,
  LOCK_MOMENTUM_VALIDATION_CANDIDATE_ID,
  MOMENTUM_VALIDATION_MDE_CENTS,
  MOMENTUM_VALIDATION_OUTCOME_SD_CENTS,
  MOMENTUM_VALIDATION_POWER_ALPHA,
  MOMENTUM_VALIDATION_TARGET_ESS,
  MOMENTUM_VALIDATION_TARGET_POWER,
  MomentumValidationCohortError,
} from "./momentumValidationCohortTypes";

export { LOCK_MOMENTUM_VALIDATION_CANDIDATE_ID };

export const LOCKED_MOMENTUM_VALIDATION_CANDIDATE = {
  lookbackWindowMs: 5000 as const,
  thresholdCents: 2 as const,
  responseHorizonMs: 30000 as const,
  direction: "continuation" as const,
  candidateId: LOCK_MOMENTUM_VALIDATION_CANDIDATE_ID,
};

export function sha256Hex(payload: string): string {
  return createHash("sha256").update(payload, "utf8").digest("hex");
}

export function hashMomentumValidationArtifact(value: unknown): string {
  return sha256Hex(stableStringify(value));
}

/**
 * Recompute sealed family + evidence identities and assert they match the
 * M14.0c-prep lock constants. Does not open TRAIN/VAL outcomes.
 */
export function assertSealedMomentumIdentitiesMatchPreOpen(): {
  familyDefinitionIdentity: string;
  evidenceContractIdentity: string;
  requiredEffectiveN: number;
} {
  const preOpen = sealMomentumPreOpenBundle();
  if (preOpen.familyDefinitionIdentity !== KNOWN_M140A_FAMILY_DEFINITION_IDENTITY) {
    throw new MomentumValidationCohortError(
      `Family identity mismatch: expected ${KNOWN_M140A_FAMILY_DEFINITION_IDENTITY}, `
        + `got ${preOpen.familyDefinitionIdentity}`,
    );
  }
  if (preOpen.evidenceContractIdentity !== KNOWN_M140A_EVIDENCE_CONTRACT_IDENTITY) {
    throw new MomentumValidationCohortError(
      `Evidence identity mismatch: expected ${KNOWN_M140A_EVIDENCE_CONTRACT_IDENTITY}, `
        + `got ${preOpen.evidenceContractIdentity}`,
    );
  }
  if (preOpen.requiredEffectiveN !== MOMENTUM_VALIDATION_TARGET_ESS) {
    throw new MomentumValidationCohortError(
      `Required ESS mismatch: expected ${MOMENTUM_VALIDATION_TARGET_ESS}, `
        + `got ${preOpen.requiredEffectiveN}`,
    );
  }
  return {
    familyDefinitionIdentity: preOpen.familyDefinitionIdentity,
    evidenceContractIdentity: preOpen.evidenceContractIdentity,
    requiredEffectiveN: preOpen.requiredEffectiveN,
  };
}

export function assertPowerDesignMatchesSealedTarget(): number {
  if (MOMENTUM_VALIDATION_POWER_ALPHA !== MOMENTUM_DEFAULT_ALPHA) {
    throw new MomentumValidationCohortError("alpha must remain 0.05");
  }
  if (MOMENTUM_VALIDATION_TARGET_POWER !== MOMENTUM_DEFAULT_TARGET_POWER) {
    throw new MomentumValidationCohortError("targetPower must remain 0.8");
  }
  if (MOMENTUM_VALIDATION_OUTCOME_SD_CENTS !== MOMENTUM_DEFAULT_OUTCOME_SD_CENTS) {
    throw new MomentumValidationCohortError("outcome SD must remain 10¢");
  }
  const derived = deriveMomentumRequiredEffectiveN({
    alpha: MOMENTUM_VALIDATION_POWER_ALPHA,
    targetPower: MOMENTUM_VALIDATION_TARGET_POWER,
    materialEffectCents: MOMENTUM_VALIDATION_MDE_CENTS,
    outcomeStandardDeviationCents: MOMENTUM_VALIDATION_OUTCOME_SD_CENTS,
  });
  if (derived.requiredEffectiveN !== MOMENTUM_VALIDATION_TARGET_ESS) {
    throw new MomentumValidationCohortError(
      `Power-derived ESS must be ${MOMENTUM_VALIDATION_TARGET_ESS}; `
        + `got ${derived.requiredEffectiveN}`,
    );
  }
  return derived.requiredEffectiveN;
}

/**
 * Bind the single locked validation candidate from a TRAIN shortlist.
 * Losers / non-shortlisted cells cannot enter validation.
 */
export function bindLockedMomentumValidationCandidate(input: {
  discoveryIdentity: string;
  shortlistCandidateIds: readonly string[];
  familyDefinitionIdentity?: string;
  evidenceContractIdentity?: string;
  verifyPreOpenIdentities?: boolean;
}): {
  lockedCandidateId: typeof LOCK_MOMENTUM_VALIDATION_CANDIDATE_ID;
  lockedCandidate: typeof LOCKED_MOMENTUM_VALIDATION_CANDIDATE;
  discoveryIdentity: typeof KNOWN_M140B_DISCOVERY_IDENTITY;
  familyDefinitionIdentity: string;
  evidenceContractIdentity: string;
} {
  if (input.discoveryIdentity !== KNOWN_M140B_DISCOVERY_IDENTITY) {
    throw new MomentumValidationCohortError(
      `TRAIN discovery identity required: expected ${KNOWN_M140B_DISCOVERY_IDENTITY}`,
    );
  }

  const expectedId = buildHypothesisId({
    backwardWindowMs: LOCKED_MOMENTUM_VALIDATION_CANDIDATE.lookbackWindowMs,
    returnThresholdCents: LOCKED_MOMENTUM_VALIDATION_CANDIDATE.thresholdCents,
    forwardHorizonMs: LOCKED_MOMENTUM_VALIDATION_CANDIDATE.responseHorizonMs,
  });
  if (expectedId !== LOCK_MOMENTUM_VALIDATION_CANDIDATE_ID) {
    throw new MomentumValidationCohortError(
      `Locked candidate id construction mismatch: ${expectedId}`,
    );
  }

  const uniqueShortlist = [...new Set(input.shortlistCandidateIds)];
  if (uniqueShortlist.length !== 1) {
    throw new MomentumValidationCohortError(
      `Validation shortlist must contain exactly the locked candidate; `
        + `got ${uniqueShortlist.length} unique entr${uniqueShortlist.length === 1 ? "y" : "ies"}`,
    );
  }
  if (uniqueShortlist[0] !== LOCK_MOMENTUM_VALIDATION_CANDIDATE_ID) {
    throw new MomentumValidationCohortError(
      `Losing TRAIN candidates cannot enter validation; expected `
        + `${LOCK_MOMENTUM_VALIDATION_CANDIDATE_ID}, got ${uniqueShortlist[0]}`,
    );
  }

  let familyDefinitionIdentity =
    input.familyDefinitionIdentity ?? KNOWN_M140A_FAMILY_DEFINITION_IDENTITY;
  let evidenceContractIdentity =
    input.evidenceContractIdentity ?? KNOWN_M140A_EVIDENCE_CONTRACT_IDENTITY;

  if (input.verifyPreOpenIdentities !== false) {
    const sealed = assertSealedMomentumIdentitiesMatchPreOpen();
    familyDefinitionIdentity = sealed.familyDefinitionIdentity;
    evidenceContractIdentity = sealed.evidenceContractIdentity;
  } else {
    if (familyDefinitionIdentity !== KNOWN_M140A_FAMILY_DEFINITION_IDENTITY) {
      throw new MomentumValidationCohortError("Family identity required / mismatch");
    }
    if (evidenceContractIdentity !== KNOWN_M140A_EVIDENCE_CONTRACT_IDENTITY) {
      throw new MomentumValidationCohortError("Evidence identity required / mismatch");
    }
  }

  assertPowerDesignMatchesSealedTarget();

  return {
    lockedCandidateId: LOCK_MOMENTUM_VALIDATION_CANDIDATE_ID,
    lockedCandidate: LOCKED_MOMENTUM_VALIDATION_CANDIDATE,
    discoveryIdentity: KNOWN_M140B_DISCOVERY_IDENTITY,
    familyDefinitionIdentity,
    evidenceContractIdentity,
  };
}
