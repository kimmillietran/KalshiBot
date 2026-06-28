import { describe, expect, it } from "vitest";

import { DataSource } from "@/lib/data/provenance";
import type { RawHistoricalRecord } from "@/lib/data/types";

import { InMemoryBronzeStore } from "./InMemoryBronzeStore";

const EVENT_TIME_A = "2026-06-26T23:15:00.000Z";
const EVENT_TIME_B = "2026-06-26T23:30:00.000Z";
const COLLECTION_TIME_A = "2026-06-27T01:00:00.000Z";
const COLLECTION_TIME_B = "2026-06-27T01:05:00.000Z";
const OBSERVED_AT = "2026-06-27T01:00:05.000Z";
const TICKER = "KXBTC15M-26JUN261930-30";

function createRecord(
  overrides: Partial<RawHistoricalRecord> = {},
): RawHistoricalRecord {
  return {
    eventTime: EVENT_TIME_A,
    collectionTime: COLLECTION_TIME_A,
    observedAt: OBSERVED_AT,
    recordId: "bronze-001",
    ticker: TICKER,
    contentType: "application/json",
    payload: { raw: true },
    provenance: {
      source: DataSource.KALSHI_REST,
      collectionTime: COLLECTION_TIME_A,
      observedAt: OBSERVED_AT,
      fetchId: "fetch-abc",
    },
    ...overrides,
  };
}

describe("InMemoryBronzeStore", () => {
  it("appends a valid raw historical record", async () => {
    const store = new InMemoryBronzeStore();
    const record = createRecord();

    await expect(store.append(record)).resolves.toBeUndefined();
    await expect(store.get("bronze-001")).resolves.toEqual(record);
  });

  it("reads records by recordId", async () => {
    const store = new InMemoryBronzeStore();
    await store.append(createRecord({ recordId: "read-me" }));

    expect(await store.get("read-me")).not.toBeNull();
    expect(await store.get("missing")).toBeNull();
  });

  it("lists records with optional filters", async () => {
    const store = new InMemoryBronzeStore();
    await store.append(
      createRecord({
        recordId: "a",
        ticker: TICKER,
        eventTime: EVENT_TIME_A,
        collectionTime: COLLECTION_TIME_A,
        provenance: {
          source: DataSource.KALSHI_REST,
          collectionTime: COLLECTION_TIME_A,
          observedAt: OBSERVED_AT,
        },
      }),
    );
    await store.append(
      createRecord({
        recordId: "b",
        ticker: "OTHER-TICKER",
        eventTime: EVENT_TIME_B,
        collectionTime: COLLECTION_TIME_B,
        provenance: {
          source: DataSource.BINANCE_SPOT,
          collectionTime: COLLECTION_TIME_B,
          observedAt: OBSERVED_AT,
        },
      }),
    );

    expect(await store.list()).toHaveLength(2);
    expect(await store.list({ ticker: TICKER })).toHaveLength(1);
    expect(await store.list({ source: DataSource.BINANCE_SPOT })).toHaveLength(1);
  });

  it("treats duplicate identical appends as idempotent", async () => {
    const store = new InMemoryBronzeStore();
    const record = createRecord();

    await store.append(record);
    await store.append(record);

    expect(await store.list()).toHaveLength(1);
  });

  it("rejects conflicting duplicate record IDs", async () => {
    const store = new InMemoryBronzeStore();
    await store.append(createRecord());

    await expect(
      store.append(createRecord({ payload: { raw: false } })),
    ).rejects.toMatchObject({
      name: "BronzeDuplicateConflictError",
      recordId: "bronze-001",
    });
  });

  it("rejects invalid raw historical records on append", async () => {
    const store = new InMemoryBronzeStore();

    await expect(
      store.append(createRecord({ ticker: "" })),
    ).rejects.toThrow();

    expect(await store.list()).toHaveLength(0);
  });

  it("returns an empty list from a new store", async () => {
    const store = new InMemoryBronzeStore();
    expect(await store.list()).toEqual([]);
    expect(await store.list({ ticker: TICKER })).toEqual([]);
  });

  it("filters by recordId", async () => {
    const store = new InMemoryBronzeStore();
    await store.append(createRecord({ recordId: "target" }));
    await store.append(createRecord({ recordId: "other" }));

    const filtered = await store.list({ recordId: "target" });
    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.recordId).toBe("target");
  });

  it("filters eventTime and collectionTime ranges inclusively at boundaries", async () => {
    const store = new InMemoryBronzeStore();
    await store.append(
      createRecord({
        recordId: "boundary",
        eventTime: EVENT_TIME_A,
        collectionTime: COLLECTION_TIME_A,
      }),
    );
    await store.append(
      createRecord({
        recordId: "outside",
        eventTime: EVENT_TIME_B,
        collectionTime: COLLECTION_TIME_B,
      }),
    );

    expect(
      await store.list({
        eventTimeFrom: EVENT_TIME_A,
        eventTimeTo: EVENT_TIME_A,
      }),
    ).toHaveLength(1);

    expect(
      await store.list({
        collectionTimeFrom: COLLECTION_TIME_A,
        collectionTimeTo: COLLECTION_TIME_A,
      }),
    ).toHaveLength(1);

    expect(
      await store.list({
        eventTimeFrom: EVENT_TIME_B,
        eventTimeTo: EVENT_TIME_B,
      }),
    ).toHaveLength(1);

    expect(
      await store.list({
        eventTimeTo: EVENT_TIME_A,
      }),
    ).toHaveLength(1);

    expect(
      await store.list({
        eventTimeFrom: EVENT_TIME_B,
      }),
    ).toHaveLength(1);

    expect(
      await store.list({
        eventTimeTo: "2026-06-26T23:14:59.999Z",
      }),
    ).toHaveLength(0);
  });

  it("does not mutate stored records when callers mutate appended input", async () => {
    const store = new InMemoryBronzeStore();
    const record = createRecord();

    await store.append(record);
    (record.payload as { raw: boolean }).raw = false;
    record.ticker = "MUTATED";

    const stored = await store.get("bronze-001");
    expect(stored?.ticker).toBe(TICKER);
    expect((stored!.payload as { raw: boolean }).raw).toBe(true);
  });

  it("does not mutate stored records when callers mutate listed copies", async () => {
    const store = new InMemoryBronzeStore();
    await store.append(createRecord());

    const listed = await store.list();
    (listed[0]!.payload as { raw: boolean }).raw = false;

    const again = await store.list();
    expect((again[0]!.payload as { raw: boolean }).raw).toBe(true);
  });

  it("returns deterministic list ordering", async () => {
    const store = new InMemoryBronzeStore();
    await store.append(
      createRecord({
        recordId: "late",
        eventTime: EVENT_TIME_B,
        collectionTime: COLLECTION_TIME_B,
      }),
    );
    await store.append(
      createRecord({
        recordId: "early",
        eventTime: EVENT_TIME_A,
        collectionTime: COLLECTION_TIME_A,
      }),
    );
    await store.append(
      createRecord({
        recordId: "same-event-a",
        eventTime: EVENT_TIME_A,
        collectionTime: COLLECTION_TIME_A,
      }),
    );
    await store.append(
      createRecord({
        recordId: "same-event-b",
        eventTime: EVENT_TIME_A,
        collectionTime: COLLECTION_TIME_A,
      }),
    );

    const firstList = await store.list();
    const secondList = await store.list();

    expect(firstList.map((record) => record.recordId)).toEqual([
      "early",
      "same-event-a",
      "same-event-b",
      "late",
    ]);
    expect(firstList.map((record) => record.recordId)).toEqual(
      secondList.map((record) => record.recordId),
    );
  });

  it("does not mutate stored records when callers mutate returned copies", async () => {
    const store = new InMemoryBronzeStore();
    await store.append(createRecord());

    const fetched = await store.get("bronze-001");
    expect(fetched).not.toBeNull();
    (fetched!.payload as { raw: boolean }).raw = false;

    const again = await store.get("bronze-001");
    expect((again!.payload as { raw: boolean }).raw).toBe(true);
  });
});
