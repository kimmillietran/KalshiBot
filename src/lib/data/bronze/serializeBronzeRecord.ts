import { rawHistoricalRecordSchema } from "@/lib/data/schemas";
import type { RawHistoricalRecord } from "@/lib/data/types";
import { stableStringify } from "@/lib/trading/config/hashConfig";

/** Deterministic JSON serialization with stable key ordering. */
export function serializeBronzeRecord(record: RawHistoricalRecord): string {
  return stableStringify(record);
}

/** Parses and validates a serialized bronze record. */
export function parseSerializedBronzeRecord(serialized: string): RawHistoricalRecord {
  const parsed: unknown = JSON.parse(serialized);
  return rawHistoricalRecordSchema.parse(parsed);
}

export function bronzeRecordsAreIdentical(
  left: RawHistoricalRecord,
  right: RawHistoricalRecord,
): boolean {
  return serializeBronzeRecord(left) === serializeBronzeRecord(right);
}

/** Deep-clones a record through stable serialization for immutable storage. */
export function cloneBronzeRecord(record: RawHistoricalRecord): RawHistoricalRecord {
  return parseSerializedBronzeRecord(serializeBronzeRecord(record));
}
