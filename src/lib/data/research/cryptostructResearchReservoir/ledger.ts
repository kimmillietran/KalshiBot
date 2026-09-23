/**
 * Append-only CryptoStruct research reservoir events + deterministic projection.
 */

import { createHash } from "node:crypto";

import { stableStringify } from "@/lib/trading/config/hashConfig";

import {
  CRYPTOSTRUCT_RESERVOIR_FORBIDDEN_FIELDS,
  CRYPTOSTRUCT_RESERVOIR_PROVIDER,
  CRYPTOSTRUCT_RESERVOIR_SERIES,
  type CryptostructReservoirEventType,
  type CryptostructReservoirState,
} from "./types";

export class CryptostructReservoirError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CryptostructReservoirError";
  }
}

export type CryptostructReservoirDayRecord = {
  utcDate: string;
  provider: typeof CRYPTOSTRUCT_RESERVOIR_PROVIDER;
  series: typeof CRYPTOSTRUCT_RESERVOIR_SERIES;
  state: CryptostructReservoirState;
  owned: boolean;
  vendorAvailable: boolean;
  byteSize: number | null;
  rawZipSha256: string | null;
  vendorFileId: string | null;
  scientificProtocolIdentity: string | null;
  researchLineage: string | null;
  primaryResultIdentity: string | null;
  reason: string | null;
  notes: string | null;
};

export type CryptostructReservoirEvent = {
  eventId: string;
  eventType: CryptostructReservoirEventType;
  utcDate: string | null; // null for inventory-wide events
  atUtc: string;
  priorState: CryptostructReservoirState | null;
  newState: CryptostructReservoirState | null;
  reason: string;
  actor: string;
  scientificProtocolIdentity: string | null;
  researchLineage: string | null;
  primaryResultIdentity: string | null;
  sourceArtifactIdentities: readonly string[];
  inventorySnapshotIdentity: string | null;
  patch: Partial<
    Pick<
      CryptostructReservoirDayRecord,
      | "owned"
      | "vendorAvailable"
      | "byteSize"
      | "rawZipSha256"
      | "vendorFileId"
      | "notes"
    >
  > | null;
};

export type CryptostructReservoirEventLedger = {
  ledgerVersion: "cryptostruct-kxbtc15m-research-reservoir-events-v1";
  provider: typeof CRYPTOSTRUCT_RESERVOIR_PROVIDER;
  series: typeof CRYPTOSTRUCT_RESERVOIR_SERIES;
  events: readonly CryptostructReservoirEvent[];
  eventLedgerIdentity: string;
};

export type CryptostructReservoirSnapshot = {
  snapshotVersion: "cryptostruct-kxbtc15m-research-reservoir-snapshot-v1";
  provider: typeof CRYPTOSTRUCT_RESERVOIR_PROVIDER;
  series: typeof CRYPTOSTRUCT_RESERVOIR_SERIES;
  materializedAtUtc: string;
  days: Record<string, CryptostructReservoirDayRecord>;
  counts: Record<CryptostructReservoirState, number>;
  eventLedgerIdentity: string;
  inventorySnapshotIdentity: string | null;
  snapshotIdentity: string;
};

export function assertNoForbiddenReservoirFields(
  value: unknown,
  path = "$",
): void {
  if (value == null || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      assertNoForbiddenReservoirFields(value[i], `${path}[${i}]`);
    }
    return;
  }
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (
      (CRYPTOSTRUCT_RESERVOIR_FORBIDDEN_FIELDS as readonly string[]).includes(k)
    ) {
      throw new CryptostructReservoirError(
        `forbidden economic/content field "${k}" at ${path}`,
      );
    }
    assertNoForbiddenReservoirFields(v, `${path}.${k}`);
  }
}

export function assertUtcDate(utcDate: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(utcDate)) {
    throw new CryptostructReservoirError(`invalid utcDate ${utcDate}`);
  }
}

export function emptyDayCounts(): Record<CryptostructReservoirState, number> {
  return {
    AVAILABLE_UNOWNED: 0,
    OWNED_SEALED_UNASSIGNED: 0,
    RESERVED_VALIDATION: 0,
    RESERVED_HOLDOUT: 0,
    OPEN_DISCOVERY: 0,
    SPENT_VALIDATION: 0,
    SPENT_HOLDOUT: 0,
    QUALITY_AUDIT_ONLY: 0,
    EXCLUDED: 0,
    UNKNOWN_QUARANTINED: 0,
  };
}

export function createEmptyEventLedger(): CryptostructReservoirEventLedger {
  const body = {
    ledgerVersion: "cryptostruct-kxbtc15m-research-reservoir-events-v1" as const,
    provider: CRYPTOSTRUCT_RESERVOIR_PROVIDER,
    series: CRYPTOSTRUCT_RESERVOIR_SERIES,
    events: [] as CryptostructReservoirEvent[],
  };
  return {
    ...body,
    eventLedgerIdentity: createHash("sha256")
      .update(stableStringify(body))
      .digest("hex"),
  };
}

export function hashEventLedger(
  events: readonly CryptostructReservoirEvent[],
): string {
  return createHash("sha256")
    .update(
      stableStringify({
        ledgerVersion: "cryptostruct-kxbtc15m-research-reservoir-events-v1",
        provider: CRYPTOSTRUCT_RESERVOIR_PROVIDER,
        series: CRYPTOSTRUCT_RESERVOIR_SERIES,
        events,
      }),
    )
    .digest("hex");
}

export function appendReservoirEvent(
  ledger: CryptostructReservoirEventLedger,
  event: Omit<CryptostructReservoirEvent, "eventId"> & { eventId?: string },
): CryptostructReservoirEventLedger {
  if (event.utcDate != null) assertUtcDate(event.utcDate);
  const eventId =
    event.eventId
    ?? createHash("sha256")
      .update(
        stableStringify({
          ...event,
          index: ledger.events.length,
        }),
      )
      .digest("hex")
      .slice(0, 32);
  const nextEvents = [
    ...ledger.events,
    { ...event, eventId } satisfies CryptostructReservoirEvent,
  ];
  return {
    ...ledger,
    events: nextEvents,
    eventLedgerIdentity: hashEventLedger(nextEvents),
  };
}

export function materializeReservoirSnapshot(input: {
  ledger: CryptostructReservoirEventLedger;
  materializedAtUtc: string;
  inventorySnapshotIdentity?: string | null;
}): CryptostructReservoirSnapshot {
  const days: Record<string, CryptostructReservoirDayRecord> = {};

  for (const ev of input.ledger.events) {
    if (ev.utcDate == null) continue;
    const prior = days[ev.utcDate];
    const base: CryptostructReservoirDayRecord = prior ?? {
      utcDate: ev.utcDate,
      provider: CRYPTOSTRUCT_RESERVOIR_PROVIDER,
      series: CRYPTOSTRUCT_RESERVOIR_SERIES,
      state: "UNKNOWN_QUARANTINED",
      owned: false,
      vendorAvailable: false,
      byteSize: null,
      rawZipSha256: null,
      vendorFileId: null,
      scientificProtocolIdentity: null,
      researchLineage: null,
      primaryResultIdentity: null,
      reason: null,
      notes: null,
    };

    const nextState = ev.newState ?? base.state;
    days[ev.utcDate] = {
      ...base,
      state: nextState,
      owned: ev.patch?.owned ?? base.owned,
      vendorAvailable: ev.patch?.vendorAvailable ?? base.vendorAvailable,
      byteSize: ev.patch?.byteSize ?? base.byteSize,
      rawZipSha256: ev.patch?.rawZipSha256 ?? base.rawZipSha256,
      vendorFileId: ev.patch?.vendorFileId ?? base.vendorFileId,
      scientificProtocolIdentity:
        ev.scientificProtocolIdentity ?? base.scientificProtocolIdentity,
      researchLineage: ev.researchLineage ?? base.researchLineage,
      primaryResultIdentity:
        ev.primaryResultIdentity ?? base.primaryResultIdentity,
      reason: ev.reason,
      notes: ev.patch?.notes ?? base.notes,
    };
  }

  const counts = emptyDayCounts();
  for (const d of Object.values(days)) {
    counts[d.state] += 1;
  }

  const inventorySnapshotIdentity = input.inventorySnapshotIdentity ?? null;
  const body = {
    snapshotVersion: "cryptostruct-kxbtc15m-research-reservoir-snapshot-v1" as const,
    provider: CRYPTOSTRUCT_RESERVOIR_PROVIDER,
    series: CRYPTOSTRUCT_RESERVOIR_SERIES,
    materializedAtUtc: input.materializedAtUtc,
    days,
    counts,
    eventLedgerIdentity: input.ledger.eventLedgerIdentity,
    inventorySnapshotIdentity,
  };

  return {
    ...body,
    snapshotIdentity: createHash("sha256")
      .update(stableStringify(body))
      .digest("hex"),
  };
}
