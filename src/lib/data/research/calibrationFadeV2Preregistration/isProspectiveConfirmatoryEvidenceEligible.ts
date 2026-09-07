import { parseIsoTimestampMs } from "../bidOnlyCandidateLifecycle/bidOnlyCandidateLifecycleUtils";

import {
  CALIBRATION_FADE_V2_FREEZE_COMMIT_SHA,
  CALIBRATION_FADE_V2_FREEZE_TIMESTAMP,
  CalibrationFadeV2PreregistrationError,
  PENDING_FREEZE_IDENTITY,
  V2_PROSPECTIVE_BOUNDARY_KIND,
  type CalibrationFadeV2ProspectiveEvidenceBoundary,
  type CalibrationFadeV2ProvenanceManifest,
} from "./calibrationFadeV2PreregistrationTypes";
import { isFreezeIdentityFinalized } from "./loadCalibrationFadeV2Provenance";

function hasCanonicalFreezeIdentity(boundary: CalibrationFadeV2ProspectiveEvidenceBoundary): boolean {
  return (
    boundary.kind === V2_PROSPECTIVE_BOUNDARY_KIND
    && boundary.freezeCommitSha === CALIBRATION_FADE_V2_FREEZE_COMMIT_SHA
    && boundary.freezeTimestamp === CALIBRATION_FADE_V2_FREEZE_TIMESTAMP
  );
}

/**
 * Returns whether a run start is eligible for formal v2 confirmatory evidence.
 * Fail-closed: missing/pending/non-canonical freeze identity → false.
 * Does not use filesystem mtime or latest-file selection.
 *
 * Semantic rule: run start must be strictly after the canonical freezeTimestamp.
 * Raw boundaries with wrong SHA/timestamp cannot become confirmatory.
 */
export function isProspectiveConfirmatoryEvidenceEligible(input: {
  freezeBoundary: CalibrationFadeV2ProspectiveEvidenceBoundary | CalibrationFadeV2ProvenanceManifest;
  runStartIso: string;
  runId?: string;
}): boolean {
  const boundary =
    "prospectiveEvidenceBoundary" in input.freezeBoundary
      ? input.freezeBoundary.prospectiveEvidenceBoundary
      : input.freezeBoundary;

  if (boundary.kind !== V2_PROSPECTIVE_BOUNDARY_KIND) {
    return false;
  }

  if (
    boundary.freezeCommitSha === PENDING_FREEZE_IDENTITY
    || boundary.freezeTimestamp === PENDING_FREEZE_IDENTITY
    || !boundary.freezeCommitSha
    || !boundary.freezeTimestamp
  ) {
    return false;
  }

  if ("prospectiveEvidenceBoundary" in input.freezeBoundary) {
    if (!isFreezeIdentityFinalized(input.freezeBoundary)) {
      return false;
    }
  }

  // Pin to immutable freeze identity even when callers pass a raw boundary.
  if (!hasCanonicalFreezeIdentity(boundary)) {
    return false;
  }

  const freezeMs = parseIsoTimestampMs(boundary.freezeTimestamp);
  const runStartMs = parseIsoTimestampMs(input.runStartIso);
  if (freezeMs === null || runStartMs === null) {
    return false;
  }

  // Strictly after freeze — equality is non-confirmatory.
  return runStartMs > freezeMs;
}

/**
 * Asserts freeze identity is finalized and canonical before treating confirmatory
 * eligibility as meaningful. Throws fail-closed when freeze is pending/missing/wrong.
 */
export function requireFinalizedFreezeBoundary(
  provenance: CalibrationFadeV2ProvenanceManifest,
): CalibrationFadeV2ProspectiveEvidenceBoundary {
  if (!isFreezeIdentityFinalized(provenance)) {
    throw new CalibrationFadeV2PreregistrationError(
      "v2 freeze identity is missing, pending, or not the canonical freeze; "
        + "confirmatory evidence eligibility fails closed",
    );
  }
  return provenance.prospectiveEvidenceBoundary;
}
