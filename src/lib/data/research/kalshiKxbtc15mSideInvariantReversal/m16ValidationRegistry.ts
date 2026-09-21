/**
 * M16.2 append-only validation cohort registry.
 * Outcome-blind progress via decideM16BlindCollectionStopping.
 */
import {
  buildM16ProspectiveCohortPlan,
  decideM16BlindCollectionStopping,
  M16_MAX_ACCEPTED_CAPTURE_HOURS,
  M16_MAX_ACCEPTED_SEGMENTS_PER_UTC_DAY,
  M16_STANDARD_SEGMENT_DURATION_MINUTES,
  M16_VALIDATION_ROLE,
  type M16BlindCollectionProgress,
} from "./m16ProspectiveCohortPlan";
import {
  assertM16ValidationAuthorityMatches,
  buildM16ValidationAuthorityBinding,
  hashM16ValidationArtifact,
} from "./m16ValidationAuthority";
import {
  M16_VALIDATION_FORBIDDEN_RUN_IDS,
  M16_VALIDATION_PROTOCOL_VERSION,
  M16ValidationCollectionError,
  type M16EligibleConfirmationUnit,
  type M16ValidationAcceptedSegment,
  type M16ValidationAuthorityBinding,
  type M16ValidationBlindIncidence,
  type M16ValidationExcludedSegment,
  type M16ValidationProgress,
  type M16ValidationRegistry,
  type M16ValidationReservation,
  type M16ValidationSegmentHealth,
} from "./m16ValidationCohortTypes";

const FORBIDDEN = new Set<string>(M16_VALIDATION_FORBIDDEN_RUN_IDS);

function recomputeRegistryIdentity(
  registry: Omit<M16ValidationRegistry, "registryIdentity">,
): string {
  return hashM16ValidationArtifact(registry);
}

function collectDedupedEligibleUnits(
  accepted: readonly M16ValidationAcceptedSegment[],
): {
  units: M16EligibleConfirmationUnit[];
  tradeCount: number;
  utcDayClusterCount: number;
} {
  const byTicker = new Map<string, M16EligibleConfirmationUnit>();
  for (const seg of accepted) {
    for (const unit of seg.blindIncidence.eligibleUnits) {
      const prev = byTicker.get(unit.marketTicker);
      if (prev) {
        if (
          prev.confirmationTimestampMs !== unit.confirmationTimestampMs
          || prev.utcDayKey !== unit.utcDayKey
        ) {
          throw new M16ValidationCollectionError(
            `ambiguous marketTicker overlap for ${unit.marketTicker}: `
              + `run ${prev.observedInRunId} vs ${unit.observedInRunId} — fail closed`,
          );
        }
        // Exact duplicate of same confirmation — count once.
        continue;
      }
      byTicker.set(unit.marketTicker, unit);
    }
  }
  const units = [...byTicker.values()].sort((a, b) => {
    const t = a.confirmationTimestampMs - b.confirmationTimestampMs;
    if (t !== 0) return t;
    return a.marketTicker.localeCompare(b.marketTicker);
  });
  const days = new Set(units.map((u) => u.utcDayKey));
  return {
    units,
    tradeCount: units.length,
    utcDayClusterCount: days.size,
  };
}

export function createEmptyM16ValidationRegistry(input: {
  authority?: M16ValidationAuthorityBinding;
  planFreezeTimestampIso: string;
  codeAuthoritySha?: string | null;
}): M16ValidationRegistry {
  const authority =
    input.authority
    ?? buildM16ValidationAuthorityBinding(input.codeAuthoritySha ?? null);
  const base = {
    protocolVersion: M16_VALIDATION_PROTOCOL_VERSION,
    authority,
    planFreezeTimestampIso: input.planFreezeTimestampIso,
    accepted: [] as M16ValidationAcceptedSegment[],
    excluded: [] as M16ValidationExcludedSegment[],
    reservations: [] as M16ValidationReservation[],
    attempts: [] as M16ValidationRegistry["attempts"],
  };
  return { ...base, registryIdentity: recomputeRegistryIdentity(base) };
}

export function computeM16ValidationProgress(
  registry: M16ValidationRegistry,
): M16ValidationProgress {
  const plan = buildM16ProspectiveCohortPlan();
  const deduped = collectDedupedEligibleUnits(registry.accepted);
  const acceptedHours = registry.accepted.reduce(
    (sum, s) => sum + s.acceptedHours,
    0,
  );
  const blindProgress: M16BlindCollectionProgress = {
    acceptedCaptureHours: acceptedHours,
    eligibleTradeCount: deduped.tradeCount,
    utcDayClusterCount: deduped.utcDayClusterCount,
    acceptedCaptureRunIds: registry.accepted.map((s) => s.runId),
  };
  const { disposition, rationale } = decideM16BlindCollectionStopping(
    blindProgress,
    plan,
  );
  const requiredTradeN = plan.evidenceThresholds.requiredTradeN;
  const minimumUtcDayClusters = plan.evidenceThresholds.minimumUtcDayClusters;
  const base = {
    protocolVersion: M16_VALIDATION_PROTOCOL_VERSION,
    authority: registry.authority,
    registryIdentity: registry.registryIdentity,
    physicalAttempts: registry.accepted.length + registry.excluded.length,
    acceptedSegments: registry.accepted.length,
    failedExcludedAttempts: registry.excluded.length,
    acceptedHours,
    maxAcceptedHours: M16_MAX_ACCEPTED_CAPTURE_HOURS,
    eligibleTradeCount: deduped.tradeCount,
    requiredTradeN,
    distinctEligibleUtcDayClusters: deduped.utcDayClusterCount,
    minimumUtcDayClusters,
    remainingTradeCount: Math.max(0, requiredTradeN - deduped.tradeCount),
    remainingUtcDayClusterCount: Math.max(
      0,
      minimumUtcDayClusters - deduped.utcDayClusterCount,
    ),
    disposition,
    dispositionRationale: rationale,
    outcomesOpened: false as const,
    pnlInspected: false as const,
    targetHitInspected: false as const,
    stopHitInspected: false as const,
  };
  return {
    ...base,
    progressIdentity: hashM16ValidationArtifact(base),
  };
}

function assertAuthorityCompatible(
  registry: M16ValidationRegistry,
  authority: M16ValidationAuthorityBinding,
): void {
  assertM16ValidationAuthorityMatches(
    { ...registry.authority, codeAuthoritySha: null },
    { ...authority, codeAuthoritySha: null },
  );
}

function assertNotForbidden(runId: string): void {
  if (FORBIDDEN.has(runId)) {
    throw new M16ValidationCollectionError(
      `forbidden runId rejected from M16 validation cohort: ${runId}`,
    );
  }
}

function assertNoDuplicateKeys(
  registry: M16ValidationRegistry,
  input: {
    runId: string;
    captureIdentityHash: string;
    reservationIdentity: string;
  },
): void {
  for (const seg of registry.accepted) {
    if (seg.runId === input.runId) {
      throw new M16ValidationCollectionError(`duplicate runId rejected: ${input.runId}`);
    }
    if (seg.captureIdentityHash === input.captureIdentityHash) {
      throw new M16ValidationCollectionError(
        `duplicate captureIdentity rejected: ${input.captureIdentityHash}`,
      );
    }
    if (seg.reservationIdentity === input.reservationIdentity) {
      throw new M16ValidationCollectionError(
        `duplicate reservationIdentity rejected: ${input.reservationIdentity}`,
      );
    }
  }
  for (const seg of registry.excluded) {
    if (seg.runId != null && seg.runId === input.runId) {
      throw new M16ValidationCollectionError(
        `duplicate runId already excluded: ${input.runId}`,
      );
    }
    if (
      seg.captureIdentityHash != null
      && seg.captureIdentityHash === input.captureIdentityHash
    ) {
      throw new M16ValidationCollectionError(
        `duplicate captureIdentity already excluded: ${input.captureIdentityHash}`,
      );
    }
  }
}

export function registerAcceptedSegment(
  registry: M16ValidationRegistry,
  input: {
    reservation: M16ValidationReservation;
    runId: string;
    captureRunDir: string;
    captureIdentityHash: string;
    health: M16ValidationSegmentHealth;
    captureStartIso: string;
    captureEndIso: string;
    /** Actual accepted minutes; healthy zero-signal = 240. Failed uses registerExcluded. */
    acceptedMinutes: number;
    utcDaysPhysicallyCovered: readonly string[];
    blindIncidence: M16ValidationBlindIncidence;
    codeAuthoritySha?: string | null;
  },
): M16ValidationRegistry {
  assertAuthorityCompatible(registry, input.reservation.authority);
  if (input.reservation.role !== M16_VALIDATION_ROLE) {
    throw new M16ValidationCollectionError(
      `accepted segment role must be ${M16_VALIDATION_ROLE}`,
    );
  }
  if (!input.health.passed) {
    throw new M16ValidationCollectionError(
      "cannot accept segment with failed health; use registerExcludedSegment",
    );
  }
  assertNotForbidden(input.runId);
  assertNoDuplicateKeys(registry, {
    runId: input.runId,
    captureIdentityHash: input.captureIdentityHash,
    reservationIdentity: input.reservation.reservationIdentity,
  });

  const sameDayAccepted = registry.accepted.filter(
    (s) => s.plannedUtcDay === input.reservation.plannedUtcDay,
  );
  if (sameDayAccepted.length >= M16_MAX_ACCEPTED_SEGMENTS_PER_UTC_DAY) {
    throw new M16ValidationCollectionError(
      `UTC day ${input.reservation.plannedUtcDay} already has an accepted segment`,
    );
  }

  if (input.acceptedMinutes <= 0) {
    throw new M16ValidationCollectionError(
      "acceptedMinutes must be > 0 for accepted segments "
        + "(healthy zero-signal still consumes full window hours)",
    );
  }
  if (input.acceptedMinutes > M16_STANDARD_SEGMENT_DURATION_MINUTES) {
    throw new M16ValidationCollectionError(
      `acceptedMinutes ${input.acceptedMinutes} exceeds max `
        + `${M16_STANDARD_SEGMENT_DURATION_MINUTES}`,
    );
  }

  const acceptedHours = input.acceptedMinutes / 60;
  const priorHours = registry.accepted.reduce((s, x) => s + x.acceptedHours, 0);
  if (priorHours + acceptedHours > M16_MAX_ACCEPTED_CAPTURE_HOURS) {
    throw new M16ValidationCollectionError(
      `accepting would exceed max accepted hours `
        + `${M16_MAX_ACCEPTED_CAPTURE_HOURS} (have ${priorHours}, adding ${acceptedHours})`,
    );
  }

  if (input.blindIncidence.outcomesOpened !== false) {
    throw new M16ValidationCollectionError("outcomesOpened must remain false");
  }
  if (input.blindIncidence.runId !== input.runId) {
    throw new M16ValidationCollectionError("blindIncidence.runId must match runId");
  }

  // Cross-cohort ticker dedupe check against existing accepted units.
  collectDedupedEligibleUnits([
    ...registry.accepted,
    {
      status: "accepted",
      ordinal: registry.accepted.length + 1,
      reservationIdentity: input.reservation.reservationIdentity,
      runId: input.runId,
      captureRunDir: input.captureRunDir,
      captureIdentityHash: input.captureIdentityHash,
      healthArtifactIdentity: input.health.healthArtifactIdentity,
      codeAuthoritySha: input.codeAuthoritySha ?? registry.authority.codeAuthoritySha,
      role: M16_VALIDATION_ROLE,
      plannedUtcDay: input.reservation.plannedUtcDay,
      captureStartIso: input.captureStartIso,
      captureEndIso: input.captureEndIso,
      acceptedMinutes: input.acceptedMinutes,
      acceptedHours,
      utcDaysPhysicallyCovered: input.utcDaysPhysicallyCovered,
      blindIncidence: input.blindIncidence,
      outcomesOpened: false,
      pnlInspected: false,
      targetHitInspected: false,
      stopHitInspected: false,
    },
  ]);

  const segment: M16ValidationAcceptedSegment = {
    status: "accepted",
    ordinal: registry.accepted.length + 1,
    reservationIdentity: input.reservation.reservationIdentity,
    runId: input.runId,
    captureRunDir: input.captureRunDir,
    captureIdentityHash: input.captureIdentityHash,
    healthArtifactIdentity: input.health.healthArtifactIdentity,
    codeAuthoritySha: input.codeAuthoritySha ?? registry.authority.codeAuthoritySha,
    role: M16_VALIDATION_ROLE,
    plannedUtcDay: input.reservation.plannedUtcDay,
    captureStartIso: input.captureStartIso,
    captureEndIso: input.captureEndIso,
    acceptedMinutes: input.acceptedMinutes,
    acceptedHours,
    utcDaysPhysicallyCovered: [...input.utcDaysPhysicallyCovered],
    blindIncidence: input.blindIncidence,
    outcomesOpened: false,
    pnlInspected: false,
    targetHitInspected: false,
    stopHitInspected: false,
  };

  const reservations = registry.reservations.some(
    (r) => r.reservationIdentity === input.reservation.reservationIdentity,
  )
    ? registry.reservations
    : [...registry.reservations, input.reservation];

  const base = {
    protocolVersion: registry.protocolVersion,
    authority: registry.authority,
    planFreezeTimestampIso: registry.planFreezeTimestampIso,
    accepted: [...registry.accepted, segment],
    excluded: registry.excluded,
    reservations,
    attempts: registry.attempts,
  };
  return { ...base, registryIdentity: recomputeRegistryIdentity(base) };
}

export function appendM16ValidationReservation(
  registry: M16ValidationRegistry,
  reservation: M16ValidationReservation,
): M16ValidationRegistry {
  if (
    registry.reservations.some(
      (r) => r.reservationIdentity === reservation.reservationIdentity,
    )
  ) {
    return registry;
  }
  assertAuthorityCompatible(registry, reservation.authority);
  const base = {
    protocolVersion: registry.protocolVersion,
    authority: registry.authority,
    planFreezeTimestampIso: registry.planFreezeTimestampIso,
    accepted: registry.accepted,
    excluded: registry.excluded,
    reservations: [...registry.reservations, reservation],
    attempts: registry.attempts,
  };
  return { ...base, registryIdentity: recomputeRegistryIdentity(base) };
}

export function registerExcludedSegment(
  registry: M16ValidationRegistry,
  input: {
    reservation?: M16ValidationReservation | null;
    runId?: string | null;
    captureIdentityHash?: string | null;
    reason: string;
    terminalStatus: string;
  },
): M16ValidationRegistry {
  if (input.reservation) {
    assertAuthorityCompatible(registry, input.reservation.authority);
  }
  if (input.runId) {
    assertNotForbidden(input.runId);
    for (const seg of registry.accepted) {
      if (seg.runId === input.runId) {
        throw new M16ValidationCollectionError(
          `cannot exclude runId already accepted: ${input.runId}`,
        );
      }
    }
    for (const seg of registry.excluded) {
      if (seg.runId === input.runId) {
        throw new M16ValidationCollectionError(
          `duplicate excluded runId: ${input.runId}`,
        );
      }
    }
  }

  const excluded: M16ValidationExcludedSegment = {
    status: "excluded",
    reservationIdentity: input.reservation?.reservationIdentity ?? null,
    runId: input.runId ?? null,
    captureIdentityHash: input.captureIdentityHash ?? null,
    reason: input.reason,
    terminalStatus: input.terminalStatus,
    acceptedMinutes: 0,
    acceptedHours: 0,
    permanentlyExcluded: true,
    outcomesOpened: false,
  };

  const reservations =
    input.reservation
    && !registry.reservations.some(
      (r) => r.reservationIdentity === input.reservation!.reservationIdentity,
    )
      ? [...registry.reservations, input.reservation]
      : registry.reservations;

  const base = {
    protocolVersion: registry.protocolVersion,
    authority: registry.authority,
    planFreezeTimestampIso: registry.planFreezeTimestampIso,
    accepted: registry.accepted,
    excluded: [...registry.excluded, excluded],
    reservations,
    attempts: registry.attempts,
  };
  return { ...base, registryIdentity: recomputeRegistryIdentity(base) };
}

/** Healthy zero-signal day: full 240m hours, 0 trades, 0 G increment. */
export function healthyZeroSignalAcceptedMinutes(): number {
  return M16_STANDARD_SEGMENT_DURATION_MINUTES;
}

/** Failed segment: 0 accepted hours. */
export function failedSegmentAcceptedMinutes(): 0 {
  return 0;
}
