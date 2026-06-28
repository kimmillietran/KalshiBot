import { rawHistoricalRecordSchema } from "@/lib/data/schemas";
import type { RawHistoricalRecord } from "@/lib/data/types";

import { bronzeKeyFromRecord } from "./bronzeKeys";
import {
  bronzeRecordsAreIdentical,
  cloneBronzeRecord,
} from "./serializeBronzeRecord";
import type {
  BronzeRecordFilter,
  BronzeRecordKey,
  BronzeStore,
} from "./types";
import { BronzeDuplicateConflictError } from "./types";

function compareRecordsForList(
  left: RawHistoricalRecord,
  right: RawHistoricalRecord,
): number {
  const eventCompare =
    Date.parse(left.eventTime) - Date.parse(right.eventTime);
  if (eventCompare !== 0) {
    return eventCompare;
  }

  const collectionCompare =
    Date.parse(left.collectionTime) - Date.parse(right.collectionTime);
  if (collectionCompare !== 0) {
    return collectionCompare;
  }

  return left.recordId.localeCompare(right.recordId);
}

function matchesFilter(
  record: RawHistoricalRecord,
  filter: BronzeRecordFilter,
): boolean {
  if (filter.recordId !== undefined && record.recordId !== filter.recordId) {
    return false;
  }
  if (filter.ticker !== undefined && record.ticker !== filter.ticker) {
    return false;
  }
  if (
    filter.source !== undefined &&
    record.provenance.source !== filter.source
  ) {
    return false;
  }
  if (
    filter.eventTimeFrom !== undefined &&
    Date.parse(record.eventTime) < Date.parse(filter.eventTimeFrom)
  ) {
    return false;
  }
  if (
    filter.eventTimeTo !== undefined &&
    Date.parse(record.eventTime) > Date.parse(filter.eventTimeTo)
  ) {
    return false;
  }
  if (
    filter.collectionTimeFrom !== undefined &&
    Date.parse(record.collectionTime) < Date.parse(filter.collectionTimeFrom)
  ) {
    return false;
  }
  if (
    filter.collectionTimeTo !== undefined &&
    Date.parse(record.collectionTime) > Date.parse(filter.collectionTimeTo)
  ) {
    return false;
  }
  return true;
}

/** Append-only in-memory bronze store with deterministic keys and ordering. */
export class InMemoryBronzeStore implements BronzeStore {
  private readonly records = new Map<BronzeRecordKey, RawHistoricalRecord>();

  async append(record: RawHistoricalRecord): Promise<void> {
    const validated = rawHistoricalRecordSchema.parse(record);
    const key = bronzeKeyFromRecord(validated);
    const existing = this.records.get(key);

    if (existing !== undefined) {
      if (bronzeRecordsAreIdentical(existing, validated)) {
        return;
      }
      throw new BronzeDuplicateConflictError(validated.recordId);
    }

    this.records.set(key, cloneBronzeRecord(validated));
  }

  async get(recordId: string): Promise<RawHistoricalRecord | null> {
    const key = bronzeKeyFromRecord({ recordId });
    const record = this.records.get(key);
    return record === undefined ? null : cloneBronzeRecord(record);
  }

  async list(
    filter?: BronzeRecordFilter,
  ): Promise<readonly RawHistoricalRecord[]> {
    const records = [...this.records.values()];

    const filtered =
      filter === undefined
        ? records
        : records.filter((record) => matchesFilter(record, filter));

    return filtered
      .sort(compareRecordsForList)
      .map((record) => cloneBronzeRecord(record));
  }
}
