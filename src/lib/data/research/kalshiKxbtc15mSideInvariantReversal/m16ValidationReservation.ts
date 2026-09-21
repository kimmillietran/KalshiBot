/**
 * M16.2 prospective reservation — MUST be created before capture begins.
 * Fixed 18:00–22:00Z / 240m (M16.1b). Outcomes remain sealed.
 */
import {
  assertM16FixedUtcWindowInsideSingleDay,
  M16_FIXED_UTC_WINDOW,
  M16_STANDARD_SEGMENT_DURATION_MINUTES,
  M16_VALIDATION_ROLE,
} from "./m16ProspectiveCohortPlan";
import {
  assertM16ValidationAuthorityMatches,
  buildM16ValidationAuthorityBinding,
  hashM16ValidationArtifact,
} from "./m16ValidationAuthority";
import {
  M16_VALIDATION_RESERVATION_VERSION,
  M16ValidationCollectionError,
  type M16ValidationAuthorityBinding,
  type M16ValidationReservation,
} from "./m16ValidationCohortTypes";
import { m16GovernedWindowForUtcDay } from "./m16ValidationSchedule";

function assertUtcDayKey(day: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    throw new M16ValidationCollectionError(
      `plannedUtcDay must be YYYY-MM-DD; got ${day}`,
    );
  }
}

/**
 * Create an immutable content-addressed reservation for one UTC day.
 * Default start = dayT18:00:00.000Z. Window must not cross midnight.
 */
export function createM16ValidationReservation(input: {
  plannedUtcDay: string;
  plannedStartIso?: string;
  requestedDurationMinutes?: number;
  createdAt?: string;
  codeAuthoritySha?: string | null;
  authority?: M16ValidationAuthorityBinding;
  replacesReservationIdentity?: string | null;
}): M16ValidationReservation {
  assertUtcDayKey(input.plannedUtcDay);
  const duration =
    input.requestedDurationMinutes ?? M16_STANDARD_SEGMENT_DURATION_MINUTES;
  if (duration !== M16_STANDARD_SEGMENT_DURATION_MINUTES) {
    throw new M16ValidationCollectionError(
      `M16.2 only permits standard segment duration `
        + `${M16_STANDARD_SEGMENT_DURATION_MINUTES}m; got ${duration}. `
        + "Never shift window for replacement.",
    );
  }

  const window = m16GovernedWindowForUtcDay(input.plannedUtcDay);
  const plannedStartIso = input.plannedStartIso ?? window.startIso;
  assertM16FixedUtcWindowInsideSingleDay({
    plannedUtcDay: input.plannedUtcDay,
    plannedStartIso,
    durationMinutes: duration,
  });
  if (plannedStartIso !== window.startIso) {
    throw new M16ValidationCollectionError(
      `plannedStartIso must be fixed ${window.startIso}; got ${plannedStartIso}`,
    );
  }

  const authority =
    input.authority
    ?? buildM16ValidationAuthorityBinding(input.codeAuthoritySha ?? null);

  const createdAt = input.createdAt ?? new Date().toISOString();
  const base = {
    reservationVersion: M16_VALIDATION_RESERVATION_VERSION,
    authority,
    role: M16_VALIDATION_ROLE,
    plannedUtcDay: input.plannedUtcDay,
    plannedStartIso,
    plannedEndIso: window.endIso,
    requestedDurationMinutes: M16_STANDARD_SEGMENT_DURATION_MINUTES,
    fixedUtcWindow: "18:00-22:00Z" as const,
    createdAt,
    replacesReservationIdentity: input.replacesReservationIdentity ?? null,
    outcomesOpened: false as const,
    pnlInspected: false as const,
    targetHitInspected: false as const,
    stopHitInspected: false as const,
  };
  const reservationIdentity = hashM16ValidationArtifact(base);
  return { ...base, reservationIdentity };
}

export function assertReservationPredatesCapture(input: {
  reservation: M16ValidationReservation;
  captureStartMs: number;
}): void {
  const createdMs = Date.parse(input.reservation.createdAt);
  if (!Number.isFinite(createdMs)) {
    throw new M16ValidationCollectionError("reservation createdAt invalid");
  }
  if (input.captureStartMs < createdMs) {
    throw new M16ValidationCollectionError(
      "reservation must predate capture start "
        + `(reservation=${input.reservation.createdAt}, captureStartMs=${input.captureStartMs})`,
    );
  }
}

/**
 * Fail closed if another non-failed/non-replaced reservation exists for the same UTC day.
 */
export function assertNoConflictingActiveReservation(input: {
  existing: readonly M16ValidationReservation[];
  plannedUtcDay: string;
  /** Reservation identities that are failed/excluded/replaced — not active. */
  inactiveReservationIdentities: ReadonlySet<string>;
}): void {
  for (const r of input.existing) {
    if (input.inactiveReservationIdentities.has(r.reservationIdentity)) continue;
    if (r.plannedUtcDay === input.plannedUtcDay) {
      throw new M16ValidationCollectionError(
        `active reservation already exists for UTC day ${input.plannedUtcDay} `
          + `(${r.reservationIdentity}); fail or replace explicitly`,
      );
    }
  }
}

export function assertReservationAuthorityCurrent(
  reservation: M16ValidationReservation,
  codeAuthoritySha: string | null = null,
): void {
  const current = buildM16ValidationAuthorityBinding(codeAuthoritySha);
  assertM16ValidationAuthorityMatches(
    { ...reservation.authority, codeAuthoritySha: null },
    { ...current, codeAuthoritySha: null },
  );
}

export function assertReservationUsesFixedWindow(
  reservation: M16ValidationReservation,
): void {
  if (reservation.fixedUtcWindow !== "18:00-22:00Z") {
    throw new M16ValidationCollectionError(
      `reservation fixedUtcWindow must be 18:00-22:00Z; got ${reservation.fixedUtcWindow}`,
    );
  }
  if (reservation.requestedDurationMinutes !== M16_STANDARD_SEGMENT_DURATION_MINUTES) {
    throw new M16ValidationCollectionError(
      `reservation duration must be ${M16_STANDARD_SEGMENT_DURATION_MINUTES}m`,
    );
  }
  if (!M16_FIXED_UTC_WINDOW.includes("18:00-22:00Z")) {
    throw new M16ValidationCollectionError("sealed cohort window mismatch");
  }
}
