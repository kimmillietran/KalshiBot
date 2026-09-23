/**
 * Fail-closed transition + allocation invariants for the CryptoStruct reservoir.
 */

import {
  CRYPTOSTRUCT_RESERVOIR_ALLOCATABLE_STATES,
  type CryptostructReservoirState,
} from "./types";
import {
  CryptostructReservoirError,
  type CryptostructReservoirDayRecord,
  type CryptostructReservoirSnapshot,
} from "./ledger";

const ALLOWED_TRANSITIONS: ReadonlyMap<
  CryptostructReservoirState,
  ReadonlySet<CryptostructReservoirState>
> = new Map([
  [
    "AVAILABLE_UNOWNED",
    new Set([
      "OWNED_SEALED_UNASSIGNED",
      "UNKNOWN_QUARANTINED",
      "EXCLUDED",
      "QUALITY_AUDIT_ONLY",
      "OPEN_DISCOVERY",
      "SPENT_VALIDATION",
    ]),
  ],
  [
    "OWNED_SEALED_UNASSIGNED",
    new Set([
      "RESERVED_VALIDATION",
      "RESERVED_HOLDOUT",
      "OPEN_DISCOVERY",
      "SPENT_VALIDATION",
      "QUALITY_AUDIT_ONLY",
      "EXCLUDED",
      "UNKNOWN_QUARANTINED",
    ]),
  ],
  [
    "RESERVED_VALIDATION",
    new Set(["SPENT_VALIDATION", "OPEN_DISCOVERY", "EXCLUDED"]),
  ],
  [
    "RESERVED_HOLDOUT",
    new Set(["SPENT_HOLDOUT", "OPEN_DISCOVERY", "EXCLUDED"]),
  ],
  ["OPEN_DISCOVERY", new Set(["EXCLUDED"])],
  ["SPENT_VALIDATION", new Set(["OPEN_DISCOVERY", "EXCLUDED"])],
  ["SPENT_HOLDOUT", new Set(["OPEN_DISCOVERY", "EXCLUDED"])],
  ["QUALITY_AUDIT_ONLY", new Set()], // terminal burn
  ["EXCLUDED", new Set()],
  [
    "UNKNOWN_QUARANTINED",
    new Set([
      "OWNED_SEALED_UNASSIGNED",
      "OPEN_DISCOVERY",
      "SPENT_VALIDATION",
      "QUALITY_AUDIT_ONLY",
      "EXCLUDED",
    ]),
  ],
]);

const FORBIDDEN_TO_SEALED = new Set<CryptostructReservoirState>([
  "OPEN_DISCOVERY",
  "SPENT_VALIDATION",
  "SPENT_HOLDOUT",
  "QUALITY_AUDIT_ONLY",
  "EXCLUDED",
]);

export function assertAllowedStateTransition(input: {
  utcDate: string;
  from: CryptostructReservoirState | null;
  to: CryptostructReservoirState;
}): void {
  if (input.from == null) return;
  if (input.from === input.to) return;
  const allowed = ALLOWED_TRANSITIONS.get(input.from);
  if (!allowed || !allowed.has(input.to)) {
    throw new CryptostructReservoirError(
      `forbidden transition ${input.utcDate}: ${input.from} → ${input.to}`,
    );
  }
  if (
    FORBIDDEN_TO_SEALED.has(input.from)
    && input.to === "OWNED_SEALED_UNASSIGNED"
  ) {
    throw new CryptostructReservoirError(
      `cannot reseal ${input.utcDate} from ${input.from}`,
    );
  }
  if (
    input.from === "QUALITY_AUDIT_ONLY"
    && (input.to === "RESERVED_VALIDATION" || input.to === "RESERVED_HOLDOUT")
  ) {
    throw new CryptostructReservoirError(
      `QUALITY_AUDIT_ONLY cannot become confirmatory: ${input.utcDate}`,
    );
  }
}

export function assertDateAllocatable(
  day: CryptostructReservoirDayRecord,
): void {
  if (
    !(CRYPTOSTRUCT_RESERVOIR_ALLOCATABLE_STATES as readonly string[]).includes(
      day.state,
    )
  ) {
    throw new CryptostructReservoirError(
      `date ${day.utcDate} state=${day.state} is not allocatable`,
    );
  }
  if (!day.owned) {
    throw new CryptostructReservoirError(
      `date ${day.utcDate} is not owned; cannot allocate`,
    );
  }
  if (day.state === "UNKNOWN_QUARANTINED") {
    throw new CryptostructReservoirError(
      `date ${day.utcDate} is quarantined; cannot allocate`,
    );
  }
  if (day.state === "AVAILABLE_UNOWNED") {
    throw new CryptostructReservoirError(
      `date ${day.utcDate} is AVAILABLE_UNOWNED; cannot allocate as owned evidence`,
    );
  }
  if (
    day.state === "QUALITY_AUDIT_ONLY"
    || day.state === "SPENT_VALIDATION"
    || day.state === "SPENT_HOLDOUT"
    || day.state === "OPEN_DISCOVERY"
  ) {
    throw new CryptostructReservoirError(
      `date ${day.utcDate} is spent/burned; cannot allocate as pristine confirmatory`,
    );
  }
}

export type ReservoirInvariantFinding = {
  severity: "error" | "warning";
  code: string;
  message: string;
  utcDate?: string;
};

export function auditReservoirInvariants(
  snapshot: CryptostructReservoirSnapshot,
): { ok: boolean; findings: ReservoirInvariantFinding[] } {
  const findings: ReservoirInvariantFinding[] = [];
  const confirmatory = new Map<string, CryptostructReservoirState>();

  for (const day of Object.values(snapshot.days)) {
    if (day.state === "AVAILABLE_UNOWNED" && day.owned) {
      findings.push({
        severity: "error",
        code: "owned-available-unowned",
        message: `${day.utcDate} marked AVAILABLE_UNOWNED but owned=true`,
        utcDate: day.utcDate,
      });
    }
    if (
      (day.state === "OWNED_SEALED_UNASSIGNED"
        || day.state === "RESERVED_VALIDATION"
        || day.state === "RESERVED_HOLDOUT"
        || day.state === "SPENT_VALIDATION"
        || day.state === "SPENT_HOLDOUT"
        || day.state === "OPEN_DISCOVERY"
        || day.state === "QUALITY_AUDIT_ONLY")
      && !day.owned
    ) {
      findings.push({
        severity: "error",
        code: "unowned-owned-state",
        message: `${day.utcDate} state=${day.state} but owned=false`,
        utcDate: day.utcDate,
      });
    }
    if (
      day.state === "RESERVED_VALIDATION"
      || day.state === "RESERVED_HOLDOUT"
    ) {
      if (!day.scientificProtocolIdentity) {
        findings.push({
          severity: "error",
          code: "reservation-missing-protocol",
          message: `${day.utcDate} reservation lacks scientificProtocolIdentity`,
          utcDate: day.utcDate,
        });
      }
      const prior = confirmatory.get(day.utcDate);
      if (prior && prior !== day.state) {
        findings.push({
          severity: "error",
          code: "multi-confirmatory-role",
          message: `${day.utcDate} has conflicting confirmatory roles`,
          utcDate: day.utcDate,
        });
      }
      confirmatory.set(day.utcDate, day.state);
    }
    if (
      day.state === "OWNED_SEALED_UNASSIGNED"
      && (day.primaryResultIdentity || day.researchLineage === "M16-ER")
    ) {
      findings.push({
        severity: "error",
        code: "sealed-with-spent-lineage",
        message: `${day.utcDate} sealed but binds spent lineage/result`,
        utcDate: day.utcDate,
      });
    }
  }

  // Recount
  const expected = { ...snapshot.counts };
  for (const k of Object.keys(expected) as (keyof typeof expected)[]) {
    expected[k] = 0;
  }
  for (const d of Object.values(snapshot.days)) {
    expected[d.state] += 1;
  }
  for (const k of Object.keys(expected) as (keyof typeof expected)[]) {
    if (expected[k] !== snapshot.counts[k]) {
      findings.push({
        severity: "error",
        code: "count-mismatch",
        message: `count ${k}: snapshot=${snapshot.counts[k]} actual=${expected[k]}`,
      });
    }
  }

  return {
    ok: findings.every((f) => f.severity !== "error"),
    findings,
  };
}
