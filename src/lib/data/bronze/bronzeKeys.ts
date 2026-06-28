import type { RawHistoricalRecord } from "@/lib/data/types";

import type { BronzeRecordKey } from "./types";

export const BRONZE_KEY_PREFIX = "bronze:record:" as const;

export function buildBronzeRecordKey(recordId: string): BronzeRecordKey {
  const trimmed = recordId.trim();
  if (trimmed.length === 0) {
    throw new Error("recordId is required for bronze key");
  }
  return `${BRONZE_KEY_PREFIX}${trimmed}`;
}

export function bronzeKeyFromRecord(
  record: Pick<RawHistoricalRecord, "recordId">,
): BronzeRecordKey {
  return buildBronzeRecordKey(record.recordId);
}

export function isBronzeRecordKey(value: string): value is BronzeRecordKey {
  return value.startsWith(BRONZE_KEY_PREFIX) && value.length > BRONZE_KEY_PREFIX.length;
}

export function recordIdFromBronzeKey(key: BronzeRecordKey): string {
  if (!isBronzeRecordKey(key)) {
    throw new Error("Invalid bronze record key");
  }
  return key.slice(BRONZE_KEY_PREFIX.length);
}
