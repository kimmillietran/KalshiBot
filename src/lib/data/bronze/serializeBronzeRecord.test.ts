import { describe, expect, it } from "vitest";

import { DataSource } from "@/lib/data/provenance";
import type { RawHistoricalRecord } from "@/lib/data/types";

import {
  bronzeRecordsAreIdentical,
  cloneBronzeRecord,
  parseSerializedBronzeRecord,
  serializeBronzeRecord,
} from "./serializeBronzeRecord";

const EVENT_TIME = "2026-06-26T23:15:00.000Z";
const COLLECTION_TIME = "2026-06-27T01:00:00.000Z";
const OBSERVED_AT = "2026-06-27T01:00:05.000Z";

function createRecord(
  overrides: Partial<RawHistoricalRecord> = {},
): RawHistoricalRecord {
  return {
    eventTime: EVENT_TIME,
    collectionTime: COLLECTION_TIME,
    observedAt: OBSERVED_AT,
    recordId: "bronze-001",
    ticker: "KXBTC15M-26JUN261930-30",
    contentType: "application/json",
    payload: {
      nested: { z: 1, a: 2 },
      items: [3, 1, 2],
      nullField: null,
    },
    provenance: {
      source: DataSource.KALSHI_REST,
      collectionTime: COLLECTION_TIME,
      observedAt: OBSERVED_AT,
      fetchId: "fetch-abc",
      apiVersion: "v2",
    },
    ...overrides,
  };
}

describe("serializeBronzeRecord", () => {
  it("serializes records with stable key ordering", () => {
    const record = createRecord();
    const reordered = createRecord({
      payload: {
        items: [3, 1, 2],
        nullField: null,
        nested: { a: 2, z: 1 },
      },
    });

    expect(serializeBronzeRecord(record)).toBe(serializeBronzeRecord(reordered));
  });

  it("preserves unknown payload fields through round-trip", () => {
    const record = createRecord({
      payload: {
        unknown: { deep: [{ x: 1 }, { y: "raw" }] },
        extra: true,
      },
    });

    const parsed = parseSerializedBronzeRecord(serializeBronzeRecord(record));
    expect(parsed.payload).toEqual(record.payload);
  });

  it("preserves eventTime, collectionTime, and observedAt", () => {
    const record = createRecord();
    const parsed = parseSerializedBronzeRecord(serializeBronzeRecord(record));

    expect(parsed.eventTime).toBe(EVENT_TIME);
    expect(parsed.collectionTime).toBe(COLLECTION_TIME);
    expect(parsed.observedAt).toBe(OBSERVED_AT);
  });

  it("preserves provenance exactly", () => {
    const record = createRecord();
    const parsed = parseSerializedBronzeRecord(serializeBronzeRecord(record));
    expect(parsed.provenance).toEqual(record.provenance);
  });

  it("detects identical records and distinct records", () => {
    const left = createRecord();
    const same = createRecord();
    const different = createRecord({ recordId: "bronze-002" });

    expect(bronzeRecordsAreIdentical(left, same)).toBe(true);
    expect(bronzeRecordsAreIdentical(left, different)).toBe(false);
  });

  it("clones records without mutating the source", () => {
    const record = createRecord();
    const cloned = cloneBronzeRecord(record);

    expect(cloned).toEqual(record);
    expect(cloned).not.toBe(record);
    expect(cloned.payload).not.toBe(record.payload);
    expect(cloned.provenance).not.toBe(record.provenance);
  });

  it("rejects malformed serialized bronze records", () => {
    expect(() => parseSerializedBronzeRecord("not-json")).toThrow();
    expect(() =>
      parseSerializedBronzeRecord(JSON.stringify({ recordId: "incomplete" })),
    ).toThrow();
  });
});
