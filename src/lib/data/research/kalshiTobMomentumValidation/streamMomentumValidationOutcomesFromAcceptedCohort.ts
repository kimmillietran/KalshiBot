/**
 * Multi-run accepted-cohort outcome streaming with explicit lineage checks.
 * Never discovers captures via latest/mtime/wildcards.
 */
import { createHash } from "node:crypto";

import type { MomentumDiscoveryIo } from "../kalshiTobMomentumDiscovery/momentumDiscoveryTypes";
import {
  KNOWN_M140A_EVIDENCE_CONTRACT_IDENTITY,
  KNOWN_M140A_FAMILY_DEFINITION_IDENTITY,
  KNOWN_M140B_DISCOVERY_IDENTITY,
  LOCK_MOMENTUM_VALIDATION_CANDIDATE_ID,
  assertAdmittedValidationSegmentCannotBecomeHoldout,
  type MomentumValidationAcceptedSegment,
  type MomentumValidationCohortRegistry,
  type MomentumValidationExcludedSegment,
} from "../kalshiTobMomentumValidationCohort";

import {
  MomentumValidationError,
  type SyntheticValidationEpisode,
} from "./momentumValidationTypes";
import {
  streamLockedCandidateValidationOutcomes,
  type LockedCandidateValidationOutcomeStreamResult,
} from "./streamLockedCandidateValidationOutcomes";

export type SealedAcceptedCaptureDescriptor = {
  runId: string;
  captureRunDir: string;
  captureIdentityHash: string;
  healthArtifactIdentity?: string | null;
  reservationAttestationHash?: string | null;
  captureStartMs: number;
};

export type SealedValidationCohortStreamInput = {
  io: MomentumDiscoveryIo;
  registry: MomentumValidationCohortRegistry;
  planIdentity: string;
  familyDefinitionIdentity: string;
  evidenceContractIdentity: string;
  discoveryIdentity: string;
  lockedCandidateId: string;
  acceptedCaptures: readonly SealedAcceptedCaptureDescriptor[];
  excludedRunIds?: readonly string[];
  verifyCaptureIdentity?: (input: {
    runId: string;
    captureRunDir: string;
  }) => Promise<string>;
  log?: (message: string) => void;
};

export type AcceptedCohortValidationOutcomeStreamResult = {
  episodes: readonly SyntheticValidationEpisode[];
  perRunDiagnostics: readonly LockedCandidateValidationOutcomeStreamResult["diagnostics"][];
  acceptedRunIds: readonly string[];
  excludedRunIds: readonly string[];
  cohortCaptureFingerprint: string;
};

function assertAuthorityBindings(input: SealedValidationCohortStreamInput): void {
  if (input.familyDefinitionIdentity !== KNOWN_M140A_FAMILY_DEFINITION_IDENTITY) {
    throw new MomentumValidationError("family identity mismatch");
  }
  if (input.evidenceContractIdentity !== KNOWN_M140A_EVIDENCE_CONTRACT_IDENTITY) {
    throw new MomentumValidationError("evidence-contract identity mismatch");
  }
  if (input.discoveryIdentity !== KNOWN_M140B_DISCOVERY_IDENTITY) {
    throw new MomentumValidationError("TRAIN discovery identity mismatch");
  }
  if (input.lockedCandidateId !== LOCK_MOMENTUM_VALIDATION_CANDIDATE_ID) {
    throw new MomentumValidationError("locked candidate identity mismatch");
  }
  if (input.planIdentity !== input.registry.planIdentity) {
    throw new MomentumValidationError("planIdentity must match registry.planIdentity");
  }
}

function assertAcceptedSegmentLineage(
  segment: MomentumValidationAcceptedSegment,
  descriptor: SealedAcceptedCaptureDescriptor,
): void {
  if (segment.runId !== descriptor.runId) {
    throw new MomentumValidationError(
      `accepted segment runId mismatch: registry=${segment.runId} descriptor=${descriptor.runId}`,
    );
  }
  if (segment.captureIdentityHash !== descriptor.captureIdentityHash) {
    throw new MomentumValidationError(
      `capture identity mismatch for ${descriptor.runId}: `
        + `registry=${segment.captureIdentityHash} descriptor=${descriptor.captureIdentityHash}`,
    );
  }
  if (segment.captureRunDir !== descriptor.captureRunDir) {
    throw new MomentumValidationError(
      `captureRunDir mismatch for ${descriptor.runId}`,
    );
  }
  if (segment.accepted !== true) {
    throw new MomentumValidationError(`segment ${descriptor.runId} is not accepted`);
  }
  if (!segment.health.passed || !segment.health.topOfBookPresent) {
    throw new MomentumValidationError(
      `segment ${descriptor.runId} failed health / top-of-book gate`,
    );
  }
  if (
    descriptor.healthArtifactIdentity != null
    && descriptor.healthArtifactIdentity !== ""
  ) {
    const expected = segment.health.artifactIdentity ?? null;
    if (expected !== descriptor.healthArtifactIdentity) {
      throw new MomentumValidationError(
        `health identity mismatch for ${descriptor.runId}: `
          + `registry=${expected ?? "null"} descriptor=${descriptor.healthArtifactIdentity}`,
      );
    }
  }
  if (
    descriptor.reservationAttestationHash != null
    && descriptor.reservationAttestationHash !== ""
    && descriptor.reservationAttestationHash !== segment.reservationAttestationHash
  ) {
    throw new MomentumValidationError(
      `reservation identity mismatch for ${descriptor.runId}`,
    );
  }
  if (segment.priorResearchRoles.some((role) => role.toLowerCase() === "holdout")) {
    throw new MomentumValidationError(
      `HOLDOUT role rejected for validation capture ${descriptor.runId}`,
    );
  }
  assertAdmittedValidationSegmentCannotBecomeHoldout({
    runId: segment.runId,
    admittedToValidationCohort: true,
    proposedRole: "validation",
  });
}

/**
 * Stream outcomes from an EXPLICIT accepted cohort.
 * Fail closed on identity / exclusion / holdout role violations.
 */
export async function streamMomentumValidationOutcomesFromAcceptedCohort(
  input: SealedValidationCohortStreamInput,
): Promise<AcceptedCohortValidationOutcomeStreamResult> {
  assertAuthorityBindings(input);

  const excludedFromRegistry = input.registry.excluded ?? [];
  const excludedRunIds = [
    ...new Set([
      ...(input.excludedRunIds ?? []),
      ...excludedFromRegistry.map((row: MomentumValidationExcludedSegment) => row.runId),
    ]),
  ].sort((a, b) => a.localeCompare(b));

  const excludedSet = new Set(excludedRunIds);
  const registryByRunId = new Map(
    input.registry.accepted.map((segment) => [segment.runId, segment]),
  );

  if (input.acceptedCaptures.length === 0) {
    throw new MomentumValidationError("acceptedCaptures must be non-empty");
  }

  const seenRunIds = new Set<string>();
  for (const capture of input.acceptedCaptures) {
    if (seenRunIds.has(capture.runId)) {
      throw new MomentumValidationError(`duplicate run ID rejected: ${capture.runId}`);
    }
    seenRunIds.add(capture.runId);
    if (excludedSet.has(capture.runId)) {
      throw new MomentumValidationError(
        `excluded failed run cannot enter outcome set: ${capture.runId}`,
      );
    }
    const segment = registryByRunId.get(capture.runId);
    if (!segment) {
      throw new MomentumValidationError(
        `descriptor run ${capture.runId} is not in registry.accepted`,
      );
    }
    assertAcceptedSegmentLineage(segment, capture);
  }

  if (input.registry.accepted.length !== input.acceptedCaptures.length) {
    throw new MomentumValidationError(
      `acceptedCaptures length ${input.acceptedCaptures.length} != `
        + `registry.accepted length ${input.registry.accepted.length}`,
    );
  }
  for (const segment of input.registry.accepted) {
    if (!seenRunIds.has(segment.runId)) {
      throw new MomentumValidationError(
        `registry accepted run missing from descriptors: ${segment.runId}`,
      );
    }
    if (excludedSet.has(segment.runId)) {
      throw new MomentumValidationError(
        `registry accepted run is also excluded: ${segment.runId}`,
      );
    }
  }

  const ordered = [...input.acceptedCaptures].sort((left, right) => {
    if (left.captureStartMs !== right.captureStartMs) {
      return left.captureStartMs - right.captureStartMs;
    }
    return left.runId.localeCompare(right.runId);
  });

  const episodes: SyntheticValidationEpisode[] = [];
  const perRunDiagnostics: LockedCandidateValidationOutcomeStreamResult["diagnostics"][] = [];
  const fingerprintParts: string[] = [];

  for (const capture of ordered) {
    if (input.verifyCaptureIdentity) {
      const actual = await input.verifyCaptureIdentity({
        runId: capture.runId,
        captureRunDir: capture.captureRunDir,
      });
      if (actual !== capture.captureIdentityHash) {
        throw new MomentumValidationError(
          `live capture identity mismatch for ${capture.runId}: `
            + `expected ${capture.captureIdentityHash}, got ${actual}`,
        );
      }
    }

    const result = await streamLockedCandidateValidationOutcomes({
      io: input.io,
      segmentRunId: capture.runId,
      captureRunDir: capture.captureRunDir,
      log: input.log,
    });
    episodes.push(...result.episodes);
    perRunDiagnostics.push(result.diagnostics);
    fingerprintParts.push(
      `${capture.runId}:${capture.captureIdentityHash}:${result.diagnostics.tobRecordsScanned}`,
    );
  }

  const cohortCaptureFingerprint = createHash("sha256")
    .update(fingerprintParts.join("|"))
    .digest("hex");

  return {
    episodes,
    perRunDiagnostics,
    acceptedRunIds: ordered.map((row) => row.runId),
    excludedRunIds,
    cohortCaptureFingerprint,
  };
}
