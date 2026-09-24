import { SILVER_BRONZE_CONTENT_TYPE } from "@/lib/data/silver";
import type { SettlementLabelRecord } from "@/lib/data/research/settlementFrictionCoverage";
import {
  classifyLabelCompleteness,
  type EnrichedSettlementLabel,
  type LabelFieldSource,
} from "./types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return null;
}

function readFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function unwrapPayload(record: Record<string, unknown>): Record<string, unknown> | null {
  const payload = record.payload;
  if (!isRecord(payload)) {
    return null;
  }
  if (isRecord(payload.market)) {
    return payload.market;
  }
  return payload;
}

type FieldBag = {
  result: string | null;
  expirationValue: string | null;
  floorStrike: number | null;
  closeTime: string | null;
  settlementTs: string | null;
  openTime: string | null;
  strikeType: string | null;
};

function emptyFields(): FieldBag {
  return {
    result: null,
    expirationValue: null,
    floorStrike: null,
    closeTime: null,
    settlementTs: null,
    openTime: null,
    strikeType: null,
  };
}

function mergePreferExisting(base: FieldBag, next: Partial<FieldBag>): FieldBag {
  return {
    result: base.result ?? next.result ?? null,
    expirationValue: base.expirationValue ?? next.expirationValue ?? null,
    floorStrike: base.floorStrike ?? next.floorStrike ?? null,
    closeTime: base.closeTime ?? next.closeTime ?? null,
    settlementTs: base.settlementTs ?? next.settlementTs ?? null,
    openTime: base.openTime ?? next.openTime ?? null,
    strikeType: base.strikeType ?? next.strikeType ?? null,
  };
}

function extractFromPayload(payload: Record<string, unknown>): Partial<FieldBag> {
  const rawResult = readString(payload.result, payload.settledOutcome);
  let result: string | null = null;
  if (rawResult) {
    const normalized = rawResult.toLowerCase();
    result = normalized === "yes" || normalized === "no" ? normalized : rawResult;
  }
  return {
    result,
    expirationValue: readString(payload.expiration_value, payload.expirationValue),
    floorStrike: readFiniteNumber(payload.floor_strike ?? payload.floorStrike),
    closeTime: readString(payload.close_time, payload.closeTime),
    settlementTs: readString(payload.settlement_ts, payload.settlementTs),
    openTime: readString(payload.open_time, payload.openTime),
    strikeType: readString(payload.strike_type, payload.strikeType),
  };
}

/**
 * Extract friction-compatible label fields from a bronze import-result payload.
 * Official API fields only — does not invent close/settlement times from ticker.
 */
export function extractLabelFromImportResult(input: {
  marketTicker: string;
  importResultRaw: unknown;
  source: LabelFieldSource;
  importResultPath: string | null;
}): EnrichedSettlementLabel {
  let fields = emptyFields();

  if (isRecord(input.importResultRaw)) {
    // Flat consumer-style or nested market/settlement wrappers
    if (isRecord(input.importResultRaw.market) || isRecord(input.importResultRaw.settlement)) {
      if (isRecord(input.importResultRaw.market)) {
        fields = mergePreferExisting(fields, extractFromPayload(input.importResultRaw.market));
      }
      if (isRecord(input.importResultRaw.settlement)) {
        fields = mergePreferExisting(fields, extractFromPayload(input.importResultRaw.settlement));
      }
    }

    // Bronze import-result.json shape
    if (Array.isArray(input.importResultRaw.bronzeRecords)) {
      const marketRecords: Record<string, unknown>[] = [];
      const settlementRecords: Record<string, unknown>[] = [];
      for (const record of input.importResultRaw.bronzeRecords) {
        if (!isRecord(record)) continue;
        const ticker = readString(record.ticker) ?? input.marketTicker;
        if (ticker !== input.marketTicker) continue;
        const contentType = readString(record.contentType);
        const payload = unwrapPayload(record);
        if (!payload) continue;
        if (contentType === SILVER_BRONZE_CONTENT_TYPE.MARKET) {
          marketRecords.push(payload);
        } else if (contentType === SILVER_BRONZE_CONTENT_TYPE.SETTLEMENT) {
          settlementRecords.push(payload);
        }
      }
      // Prefer market wire for official fields; settlement supplements outcome/ts
      for (const payload of marketRecords) {
        fields = mergePreferExisting(fields, extractFromPayload(payload));
      }
      for (const payload of settlementRecords) {
        fields = mergePreferExisting(fields, extractFromPayload(payload));
      }
    }

    // Direct flat fields (export round-trip)
    if (typeof input.importResultRaw.marketTicker === "string") {
      fields = mergePreferExisting(fields, extractFromPayload(input.importResultRaw));
    }
  }

  const { completeness, missingFields } = classifyLabelCompleteness(fields);
  const fieldSource = input.source;
  const provenanceFor = (value: unknown): LabelFieldSource =>
    value != null && value !== "" ? fieldSource : "absent";

  return {
    marketTicker: input.marketTicker,
    ...fields,
    source: completeness === "missing" ? "absent" : fieldSource,
    importResultPath: input.importResultPath,
    fieldProvenance: {
      result: provenanceFor(fields.result),
      expirationValue: provenanceFor(fields.expirationValue),
      floorStrike: provenanceFor(fields.floorStrike),
      closeTime: provenanceFor(fields.closeTime),
      settlementTs: provenanceFor(fields.settlementTs),
    },
    completeness,
    missingFields,
  };
}

export function toSettlementLabelRecord(
  label: EnrichedSettlementLabel,
): SettlementLabelRecord | null {
  if (
    label.result == null
    && label.expirationValue == null
    && label.floorStrike == null
    && label.closeTime == null
    && label.settlementTs == null
  ) {
    return null;
  }
  return {
    marketTicker: label.marketTicker,
    result: label.result,
    expirationValue: label.expirationValue,
    floorStrike: label.floorStrike,
    closeTime: label.closeTime,
    settlementTs: label.settlementTs,
  };
}

export function serializeSettlementLabelsJsonl(
  labels: readonly SettlementLabelRecord[],
): string {
  const sorted = [...labels].sort((a, b) => a.marketTicker.localeCompare(b.marketTicker));
  return `${sorted.map((row) => JSON.stringify(row)).join("\n")}${sorted.length ? "\n" : ""}`;
}

export function detectOfficialFieldConflicts(input: {
  existing: EnrichedSettlementLabel;
  incoming: EnrichedSettlementLabel;
}): string[] {
  const conflicts: string[] = [];
  for (const key of [
    "result",
    "expirationValue",
    "floorStrike",
    "closeTime",
    "settlementTs",
  ] as const) {
    const a = input.existing[key];
    const b = input.incoming[key];
    if (a == null || b == null) continue;
    if (a !== b) conflicts.push(key);
  }
  return conflicts;
}
