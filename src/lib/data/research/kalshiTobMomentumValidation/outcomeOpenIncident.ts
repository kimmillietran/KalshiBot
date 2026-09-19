/**
 * Durable outcome-open execution lineage for M14.0c.
 *
 * Distinguishes authorization / execution-start / incident / sealed validation
 * so a software execution failure is not confused with validation-failed, and
 * so a post-fix retry is bound to the same frozen cohort + incident receipt.
 *
 * Does not rewrite historical incident evidence.
 */
import { createHash } from "node:crypto";
import { join } from "node:path";

import {
  KNOWN_M140A_EVIDENCE_CONTRACT_IDENTITY,
  KNOWN_M140A_FAMILY_DEFINITION_IDENTITY,
  KNOWN_M140B_DISCOVERY_IDENTITY,
  LOCK_MOMENTUM_VALIDATION_CANDIDATE_ID,
} from "../kalshiTobMomentumValidationCohort";

import {
  DEFAULT_MOMENTUM_VALIDATION_JSON_ROOT,
  MomentumValidationError,
  type MomentumValidationCohortAuthorityInput,
} from "./momentumValidationTypes";

export type OutcomeOpenLifecyclePhase =
  | "outcome-access-authorized"
  | "outcome-execution-started"
  | "outcome-execution-incident"
  | "validation-artifact-sealed";

export type MomentumValidationOutcomeExecutionStarted = {
  schemaVersion: "m14-momentum-validation-outcome-execution-started-v1";
  phase: "outcome-execution-started";
  startedAt: string;
  codeAuthoritySha: string | null;
  implementationIdentity: string;
  cohortPlanIdentity: string;
  cohortRegistryFingerprint: string;
  lockedCandidateId: typeof LOCK_MOMENTUM_VALIDATION_CANDIDATE_ID;
  familyDefinitionIdentity: typeof KNOWN_M140A_FAMILY_DEFINITION_IDENTITY;
  evidenceContractIdentity: typeof KNOWN_M140A_EVIDENCE_CONTRACT_IDENTITY;
  discoveryIdentity: typeof KNOWN_M140B_DISCOVERY_IDENTITY;
  acceptedRunIds: readonly string[];
  acceptedCaptureIdentityHashes: readonly string[];
  excludedRunIds: readonly string[];
  /** Prior software-incident receipt identity when this run is a governed retry. */
  priorIncidentIdentity: string | null;
  holdoutOpened: false;
};

export type MomentumValidationOutcomeExecutionIncident = {
  schemaVersion: "m14-momentum-validation-outcome-execution-incident-v1";
  phase: "outcome-execution-incident";
  recordedAt: string;
  incidentIdentity: string;
  codeAuthoritySha: string | null;
  implementationIdentity: string;
  cohortPlanIdentity: string;
  cohortRegistryFingerprint: string;
  lockedCandidateId: typeof LOCK_MOMENTUM_VALIDATION_CANDIDATE_ID;
  familyDefinitionIdentity: typeof KNOWN_M140A_FAMILY_DEFINITION_IDENTITY;
  evidenceContractIdentity: typeof KNOWN_M140A_EVIDENCE_CONTRACT_IDENTITY;
  discoveryIdentity: typeof KNOWN_M140B_DISCOVERY_IDENTITY;
  acceptedRunIds: readonly string[];
  acceptedCaptureIdentityHashes: readonly string[];
  excludedRunIds: readonly string[];
  errorMessage: string;
  /**
   * Explicit: this is NOT a governed validation-failed scientific result.
   * No primary estimand was sealed.
   */
  validationArtifactSealed: false;
  scientificVerdictEmitted: false;
  holdoutOpened: false;
};

export type SoftwareIncidentRetryLineage = {
  priorIncidentIdentity: string;
  priorIncidentPath: string;
  /** Must match frozen cohort + candidate of the incident. */
  sameCohortRequired: true;
  sameCandidateRequired: true;
  /** Retry completes the same predeclared analysis after an engine failure. */
  isScientificRevalidation: false;
};

function stableStringify(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export function fingerprintCohortRegistryAuthority(
  authority: MomentumValidationCohortAuthorityInput,
): string {
  const accepted = authority.acceptedSegments ?? authority.registry.accepted;
  const payload = {
    planIdentity: authority.registry.planIdentity,
    accepted: accepted.map((row) => ({
      runId: row.runId,
      captureIdentityHash: row.captureIdentityHash,
      captureStartMs: row.captureStartMs,
    })),
    excluded: (authority.registry.excluded ?? []).map((row) => row.runId).sort(),
  };
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

export function computeOutcomeExecutionIncidentIdentity(
  incident: Omit<MomentumValidationOutcomeExecutionIncident, "incidentIdentity">,
): string {
  const payload = {
    schemaVersion: incident.schemaVersion,
    phase: incident.phase,
    recordedAt: incident.recordedAt,
    codeAuthoritySha: incident.codeAuthoritySha,
    cohortRegistryFingerprint: incident.cohortRegistryFingerprint,
    lockedCandidateId: incident.lockedCandidateId,
    acceptedRunIds: incident.acceptedRunIds,
    errorMessage: incident.errorMessage,
  };
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

export function outcomeExecutionStartedPath(cohortRegistryFingerprint: string): string {
  return join(
    DEFAULT_MOMENTUM_VALIDATION_JSON_ROOT,
    "execution-lineage",
    cohortRegistryFingerprint,
    "outcome-execution-started.json",
  );
}

export function outcomeExecutionIncidentPath(
  cohortRegistryFingerprint: string,
  incidentIdentity: string,
): string {
  return join(
    DEFAULT_MOMENTUM_VALIDATION_JSON_ROOT,
    "execution-lineage",
    cohortRegistryFingerprint,
    `outcome-execution-incident-${incidentIdentity.slice(0, 16)}.json`,
  );
}

/**
 * Assert a software-incident retry binds to the same frozen cohort/candidate
 * and references a preserved incident receipt. Rejects alternate analyses.
 */
export function assertSoftwareIncidentRetryLineage(input: {
  retry: SoftwareIncidentRetryLineage;
  incident: MomentumValidationOutcomeExecutionIncident;
  cohortAuthority: MomentumValidationCohortAuthorityInput;
  acceptedCaptureIdentityHashes: readonly string[];
  lockedCandidateId: string;
}): void {
  if (input.retry.isScientificRevalidation !== false) {
    throw new MomentumValidationError(
      "Software-incident retry must not be marked as a scientific revalidation",
    );
  }
  if (input.retry.priorIncidentIdentity !== input.incident.incidentIdentity) {
    throw new MomentumValidationError(
      "Retry priorIncidentIdentity must match preserved incident receipt",
    );
  }
  if (input.incident.phase !== "outcome-execution-incident") {
    throw new MomentumValidationError("Retry requires an outcome-execution-incident receipt");
  }
  if (input.incident.validationArtifactSealed !== false) {
    throw new MomentumValidationError(
      "Incident receipt must declare validationArtifactSealed=false",
    );
  }
  if (input.lockedCandidateId !== input.incident.lockedCandidateId) {
    throw new MomentumValidationError(
      "Software-incident retry rejected: locked candidate mismatch",
    );
  }
  if (input.lockedCandidateId !== LOCK_MOMENTUM_VALIDATION_CANDIDATE_ID) {
    throw new MomentumValidationError(
      "Software-incident retry rejected: only locked validation candidate admitted",
    );
  }
  const registryFp = fingerprintCohortRegistryAuthority(input.cohortAuthority);
  if (registryFp !== input.incident.cohortRegistryFingerprint) {
    throw new MomentumValidationError(
      "Software-incident retry rejected: cohort registry fingerprint mismatch",
    );
  }
  if (input.cohortAuthority.planIdentity !== input.incident.cohortPlanIdentity) {
    throw new MomentumValidationError(
      "Software-incident retry rejected: cohort-plan identity mismatch",
    );
  }
  if (
    input.cohortAuthority.familyDefinitionIdentity
    !== input.incident.familyDefinitionIdentity
  ) {
    throw new MomentumValidationError(
      "Software-incident retry rejected: family identity mismatch",
    );
  }
  if (
    input.cohortAuthority.evidenceContractIdentity
    !== input.incident.evidenceContractIdentity
  ) {
    throw new MomentumValidationError(
      "Software-incident retry rejected: evidence-contract identity mismatch",
    );
  }
  if (input.cohortAuthority.discoveryIdentity !== input.incident.discoveryIdentity) {
    throw new MomentumValidationError(
      "Software-incident retry rejected: TRAIN discovery identity mismatch",
    );
  }
  const expectedHashes = [...input.incident.acceptedCaptureIdentityHashes].sort();
  const actualHashes = [...input.acceptedCaptureIdentityHashes].sort();
  if (JSON.stringify(expectedHashes) !== JSON.stringify(actualHashes)) {
    throw new MomentumValidationError(
      "Software-incident retry rejected: accepted capture identities mismatch",
    );
  }
}

export function buildOutcomeExecutionStarted(input: {
  startedAt: string;
  codeAuthoritySha: string | null;
  cohortAuthority: MomentumValidationCohortAuthorityInput;
  acceptedRunIds: readonly string[];
  acceptedCaptureIdentityHashes: readonly string[];
  excludedRunIds: readonly string[];
  priorIncidentIdentity?: string | null;
}): MomentumValidationOutcomeExecutionStarted {
  return {
    schemaVersion: "m14-momentum-validation-outcome-execution-started-v1",
    phase: "outcome-execution-started",
    startedAt: input.startedAt,
    codeAuthoritySha: input.codeAuthoritySha,
    implementationIdentity: "runGovernedRealCaptureMomentumValidation/v1",
    cohortPlanIdentity: input.cohortAuthority.planIdentity,
    cohortRegistryFingerprint: fingerprintCohortRegistryAuthority(input.cohortAuthority),
    lockedCandidateId: LOCK_MOMENTUM_VALIDATION_CANDIDATE_ID,
    familyDefinitionIdentity: KNOWN_M140A_FAMILY_DEFINITION_IDENTITY,
    evidenceContractIdentity: KNOWN_M140A_EVIDENCE_CONTRACT_IDENTITY,
    discoveryIdentity: KNOWN_M140B_DISCOVERY_IDENTITY,
    acceptedRunIds: input.acceptedRunIds,
    acceptedCaptureIdentityHashes: input.acceptedCaptureIdentityHashes,
    excludedRunIds: input.excludedRunIds,
    priorIncidentIdentity: input.priorIncidentIdentity ?? null,
    holdoutOpened: false,
  };
}

export function buildOutcomeExecutionIncident(input: {
  recordedAt: string;
  codeAuthoritySha: string | null;
  cohortAuthority: MomentumValidationCohortAuthorityInput;
  acceptedRunIds: readonly string[];
  acceptedCaptureIdentityHashes: readonly string[];
  excludedRunIds: readonly string[];
  errorMessage: string;
}): MomentumValidationOutcomeExecutionIncident {
  const base = {
    schemaVersion: "m14-momentum-validation-outcome-execution-incident-v1" as const,
    phase: "outcome-execution-incident" as const,
    recordedAt: input.recordedAt,
    codeAuthoritySha: input.codeAuthoritySha,
    implementationIdentity: "runGovernedRealCaptureMomentumValidation/v1",
    cohortPlanIdentity: input.cohortAuthority.planIdentity,
    cohortRegistryFingerprint: fingerprintCohortRegistryAuthority(input.cohortAuthority),
    lockedCandidateId: LOCK_MOMENTUM_VALIDATION_CANDIDATE_ID,
    familyDefinitionIdentity: KNOWN_M140A_FAMILY_DEFINITION_IDENTITY,
    evidenceContractIdentity: KNOWN_M140A_EVIDENCE_CONTRACT_IDENTITY,
    discoveryIdentity: KNOWN_M140B_DISCOVERY_IDENTITY,
    acceptedRunIds: input.acceptedRunIds,
    acceptedCaptureIdentityHashes: input.acceptedCaptureIdentityHashes,
    excludedRunIds: input.excludedRunIds,
    errorMessage: input.errorMessage,
    validationArtifactSealed: false as const,
    scientificVerdictEmitted: false as const,
    holdoutOpened: false as const,
  };
  return {
    ...base,
    incidentIdentity: computeOutcomeExecutionIncidentIdentity(base),
  };
}

export function serializeOutcomeExecutionArtifact(value: unknown): string {
  return stableStringify(value);
}
