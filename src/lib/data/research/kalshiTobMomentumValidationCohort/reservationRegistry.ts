import {
  PRIOR_LEAD_LAG_HOLDOUT_RUN_ID,
  PRIOR_LEAD_LAG_TRAIN_RUN_ID,
  PRIOR_LEAD_LAG_VALIDATION_RUN_ID,
} from "../momentumEvidenceContract";

import { hashMomentumValidationArtifact } from "./lockedCandidateBinding";
import {
  MOMENTUM_VALIDATION_PRIOR_CONTAMINATED_RUN_IDS,
  MOMENTUM_VALIDATION_SEGMENT_DURATION_MINUTES,
  MomentumValidationCohortError,
  type MomentumValidationAcceptedSegment,
  type MomentumValidationBlindIncidence,
  type MomentumValidationExcludedSegment,
  type MomentumValidationSegmentHealth,
  type MomentumValidationSegmentReservation,
} from "./momentumValidationCohortTypes";

export type MomentumValidationReservationInput = {
  runId: string;
  captureRunDir: string;
  captureStartMs: number;
  captureEndMs: number | null;
  durationMinutes?: number | null;
  captureIdentityHash: string;
  health: MomentumValidationSegmentHealth;
  captureEndReason?: string | null;
  configIdentity?: string | null;
  priorResearchRoles?: readonly string[];
  contaminationClassification?: string;
  intendedCohortPosition?: number | null;
  /** Must be attested prospectively for this lineage; historical self-declare rejected. */
  reservedForValidationLineage: true;
  planIdentity: string;
  planFreezeTimestampIso: string;
  /** Optional claim that an arbitrary historical run is already clean — always rejected. */
  historicalSelfDeclaredClean?: boolean;
  /** Blind incidence required only when admitting as accepted. */
  blindIncidence?: MomentumValidationBlindIncidence;
  independentUnitIds?: readonly string[];
};

export type MomentumValidationCohortRegistry = {
  planIdentity: string;
  planFreezeTimestampIso: string;
  accepted: MomentumValidationAcceptedSegment[];
  excluded: MomentumValidationExcludedSegment[];
};

function assertNotPriorContaminated(runId: string): void {
  if (runId === PRIOR_LEAD_LAG_TRAIN_RUN_ID) {
    throw new MomentumValidationCohortError(
      `prior TRAIN cannot enter validation cohort: ${runId}`,
    );
  }
  if (runId === PRIOR_LEAD_LAG_VALIDATION_RUN_ID) {
    throw new MomentumValidationCohortError(
      `prior lead-lag validation cannot enter validation cohort: ${runId}`,
    );
  }
  if (runId === PRIOR_LEAD_LAG_HOLDOUT_RUN_ID) {
    throw new MomentumValidationCohortError(
      `prior holdout cannot enter validation cohort: ${runId}`,
    );
  }
  if (
    (MOMENTUM_VALIDATION_PRIOR_CONTAMINATED_RUN_IDS as readonly string[]).includes(runId)
  ) {
    throw new MomentumValidationCohortError(
      `prior contaminated run rejected from validation cohort: ${runId}`,
    );
  }
}

function assertProspectiveReservationGates(input: MomentumValidationReservationInput): void {
  assertNotPriorContaminated(input.runId);

  if (input.historicalSelfDeclaredClean) {
    throw new MomentumValidationCohortError(
      "historical arbitrary run cannot self-declare clean / "
        + "untouched-for-short-horizon-price-response",
    );
  }

  if (!input.reservedForValidationLineage) {
    throw new MomentumValidationCohortError(
      "segment must be prospectively reserved for validation lineage",
    );
  }

  if (!input.planIdentity || !input.planFreezeTimestampIso) {
    throw new MomentumValidationCohortError(
      "prospective reservation requires plan identity and freeze timestamp",
    );
  }

  const freezeMs = Date.parse(input.planFreezeTimestampIso);
  if (!Number.isFinite(freezeMs) || !Number.isFinite(input.captureStartMs)) {
    throw new MomentumValidationCohortError(
      "invalid plan freeze / capture start timestamps for reservation",
    );
  }
  if (input.captureStartMs < freezeMs) {
    throw new MomentumValidationCohortError(
      "pre-freeze capture rejected: capture began before cohort plan freeze timestamp",
    );
  }

  if (!input.captureIdentityHash) {
    throw new MomentumValidationCohortError("exact capture content identity required");
  }
  if (!input.captureRunDir) {
    throw new MomentumValidationCohortError("capture run directory reference required");
  }
}

function buildReservationRecord(
  input: MomentumValidationReservationInput,
): MomentumValidationSegmentReservation {
  const withoutHash = {
    runId: input.runId,
    captureRunDir: input.captureRunDir,
    captureStartMs: input.captureStartMs,
    captureEndMs: input.captureEndMs,
    durationMinutes:
      input.durationMinutes
      ?? (input.captureEndMs != null
        ? (input.captureEndMs - input.captureStartMs) / 60_000
        : null),
    captureIdentityHash: input.captureIdentityHash,
    health: input.health,
    captureEndReason: input.captureEndReason ?? null,
    configIdentity: input.configIdentity ?? null,
    priorResearchRoles: input.priorResearchRoles ?? [],
    contaminationClassification:
      input.contaminationClassification
      ?? "untouched-for-short-horizon-price-response",
    intendedCohortPosition: input.intendedCohortPosition ?? null,
    outcomesOpened: false as const,
    reservedForValidationLineage: true as const,
    reservedAfterPlanFreeze: true as const,
    planIdentity: input.planIdentity,
  };
  return {
    ...withoutHash,
    reservationAttestationHash: hashMomentumValidationArtifact(withoutHash),
  };
}

export function createEmptyMomentumValidationCohortRegistry(input: {
  planIdentity: string;
  planFreezeTimestampIso: string;
}): MomentumValidationCohortRegistry {
  return {
    planIdentity: input.planIdentity,
    planFreezeTimestampIso: input.planFreezeTimestampIso,
    accepted: [],
    excluded: [],
  };
}

/**
 * Register a completed segment without opening outcomes.
 * Unhealthy / invalid segments go to excluded lineage and do NOT consume accepted budget.
 * Accepted segments are ordered by captureStartMs then runId.
 */
export function registerMomentumValidationSegment(
  registry: MomentumValidationCohortRegistry,
  input: MomentumValidationReservationInput,
): MomentumValidationCohortRegistry {
  if (input.planIdentity !== registry.planIdentity) {
    throw new MomentumValidationCohortError(
      "reservation planIdentity must match cohort registry planIdentity",
    );
  }
  if (input.planFreezeTimestampIso !== registry.planFreezeTimestampIso) {
    throw new MomentumValidationCohortError(
      "reservation freeze timestamp must match cohort registry freeze timestamp",
    );
  }

  try {
    assertProspectiveReservationGates(input);
  } catch (error) {
    if (error instanceof MomentumValidationCohortError) {
      const reservation = buildReservationRecord({
        ...input,
        // Still record exclusion for contamination/self-declare when possible.
        reservedForValidationLineage: true,
      });
      const excluded: MomentumValidationExcludedSegment = {
        ...reservation,
        accepted: false,
        exclusionReason: error.message,
      };
      return {
        ...registry,
        excluded: [...registry.excluded, excluded],
      };
    }
    throw error;
  }

  // For prior contaminated runs we throw before record — keep throw semantics for tests.
  // (assertProspectiveReservationGates already threw into excluded path above.)

  const reservation = buildReservationRecord(input);

  if (
    input.durationMinutes != null
    && Number.isFinite(input.durationMinutes)
    && Math.abs(input.durationMinutes - MOMENTUM_VALIDATION_SEGMENT_DURATION_MINUTES) > 1e-9
    && input.health.passed
  ) {
    // Compatible duration is expected for accepted healthy segments; mismatch excludes.
    const excluded: MomentumValidationExcludedSegment = {
      ...reservation,
      accepted: false,
      exclusionReason:
        `segment duration must be ${MOMENTUM_VALIDATION_SEGMENT_DURATION_MINUTES} minutes`,
    };
    return {
      ...registry,
      excluded: [...registry.excluded, excluded],
    };
  }

  if (!input.health.passed || !input.health.topOfBookPresent) {
    const excluded: MomentumValidationExcludedSegment = {
      ...reservation,
      accepted: false,
      exclusionReason:
        input.health.failureReasons.join("; ")
        || (!input.health.topOfBookPresent
          ? "top-of-book missing"
          : `unhealthy segment excluded: ${input.health.verdict ?? "failed"}`),
    };
    return {
      ...registry,
      excluded: [...registry.excluded, excluded],
    };
  }

  if (registry.accepted.some((row) => row.runId === input.runId)) {
    throw new MomentumValidationCohortError(`duplicate run rejected: ${input.runId}`);
  }
  if (
    registry.accepted.some(
      (row) => row.captureIdentityHash === input.captureIdentityHash,
    )
  ) {
    throw new MomentumValidationCohortError(
      `duplicate capture identity rejected: ${input.captureIdentityHash}`,
    );
  }

  if (!input.blindIncidence || !input.independentUnitIds) {
    throw new MomentumValidationCohortError(
      "accepted segment requires blind incidence and independent unit ids "
        + "(outcome fields must remain closed)",
    );
  }
  if (input.blindIncidence.outcomesOpened !== false) {
    throw new MomentumValidationCohortError("outcomesOpened must remain false");
  }
  if (input.blindIncidence.segmentRunId !== input.runId) {
    throw new MomentumValidationCohortError("blind incidence segmentRunId must match runId");
  }

  const accepted: MomentumValidationAcceptedSegment = {
    ...reservation,
    accepted: true,
    blindIncidence: input.blindIncidence,
    independentUnitIds: [...input.independentUnitIds],
  };

  const nextAccepted = [...registry.accepted, accepted].sort((left, right) => {
    if (left.captureStartMs !== right.captureStartMs) {
      return left.captureStartMs - right.captureStartMs;
    }
    return left.runId.localeCompare(right.runId);
  });

  return {
    ...registry,
    accepted: nextAccepted,
    excluded: registry.excluded,
  };
}

/**
 * Strict gate used by tests: prior contaminated runs must throw (not soft-exclude)
 * when checked in isolation before registry write.
 */
export function assertRunEligibleForMomentumValidationCohort(runId: string): void {
  assertNotPriorContaminated(runId);
}

export function assertHistoricalCannotSelfDeclareClean(input: {
  runId: string;
  historicalSelfDeclaredClean?: boolean;
  captureStartMs: number;
  planFreezeTimestampIso: string;
}): void {
  if (input.historicalSelfDeclaredClean) {
    throw new MomentumValidationCohortError(
      "historical arbitrary run cannot self-declare clean / "
        + "untouched-for-short-horizon-price-response",
    );
  }
  const freezeMs = Date.parse(input.planFreezeTimestampIso);
  if (Number.isFinite(freezeMs) && input.captureStartMs < freezeMs) {
    throw new MomentumValidationCohortError(
      "historical arbitrary run cannot self-declare clean: capture precedes plan freeze",
    );
  }
}
