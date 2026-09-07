import { describe, expect, it } from "vitest";

import {
  LIVE_CANDLE_GRANULARITY_MS,
  LIVE_CANDLE_PROVIDER,
  LIVE_CANDLE_PRODUCT_ID,
  LIVE_CANDLE_SOURCE,
  LIVE_CANDLE_SOURCE_RECORD_TYPE,
  type BtcCandles1mPersistedRecord,
  type CompletedCandleFetchResult,
  type FetchCompletedCandles,
} from "./btcCandles1mSidecarTypes";
import { createBtcCandles1mSidecar } from "./btcCandles1mSidecar";

const PROCESS_START_MS = Date.parse("2026-09-07T14:00:10.000Z");
const M0_OPEN_MS = Date.parse("2026-09-07T13:49:00.000Z");

function iso(ms: number): string {
  return new Date(ms).toISOString();
}

function tuple(
  openMs: number,
  close: number,
  volume = 1,
): [number, number, number, number, number, number] {
  return [openMs / 1000, close - 10, close + 10, close, close, volume];
}

function elevenClosedMinutes(): unknown[] {
  return Array.from({ length: 11 }, (_, index) =>
    tuple(M0_OPEN_MS + index * LIVE_CANDLE_GRANULARITY_MS, 100_000 + index),
  );
}

function createSidecarHarness(input: {
  fetch: FetchCompletedCandles;
  nowMs?: number;
  runId?: string;
  processEpochId?: string;
  pollIntervalMs?: number;
}) {
  let nowMs = input.nowMs ?? PROCESS_START_MS;
  const records: BtcCandles1mPersistedRecord[] = [];
  const sidecar = createBtcCandles1mSidecar({
    runId: input.runId ?? "run-A",
    processEpochId: input.processEpochId ?? "epoch-1",
    now: () => new Date(nowMs),
    writer: {
      appendBtcCandles1m: (record) => {
        records.push(record);
      },
    },
    fetchCompletedCandles: input.fetch,
    pollIntervalMs: input.pollIntervalMs ?? 15_000,
    backfillCompletedMinutes: 15,
    degradedAfterConsecutiveFailures: 3,
  });
  return {
    sidecar,
    records,
    setNow: (ms: number) => {
      nowMs = ms;
    },
    advance: (ms: number) => {
      nowMs += ms;
    },
  };
}

describe("createBtcCandles1mSidecar identity and startup backfill", () => {
  it("writes evaluator-compatible rows with authoritative runId and shared processEpochId", async () => {
    const harness = createSidecarHarness({
      fetch: async () => ({
        ok: true,
        status: 200,
        body: elevenClosedMinutes(),
        requestStartedAtLocal: iso(PROCESS_START_MS),
      }),
    });

    await harness.sidecar.runStartupBackfill();

    expect(harness.records).toHaveLength(11);
    expect(harness.sidecar.health().startupBackfillRecords).toBe(11);
    for (const [index, record] of harness.records.entries()) {
      expect(record.runId).toBe("run-A");
      expect(record.processEpochId).toBe("epoch-1");
      expect(record.provider).toBe(LIVE_CANDLE_PROVIDER);
      expect(record.productId).toBe(LIVE_CANDLE_PRODUCT_ID);
      expect(record.sourceRecordType).toBe(LIVE_CANDLE_SOURCE_RECORD_TYPE);
      expect(record.source).toBe(LIVE_CANDLE_SOURCE);
      expect(record.granularityMs).toBe(60_000);
      expect(Date.parse(record.candleCloseTime) - Date.parse(record.candleOpenTime)).toBe(
        59_999,
      );
      expect(record.retrievalMethod).toBe("startup-backfill");
      expect(record.retrievalMethod).not.toBe("synthetic-fixture");
      expect(record.observedAtLocal).toBe(iso(PROCESS_START_MS));
      expect(record.firstObservedAtLocal).toBe(iso(PROCESS_START_MS));
      expect(record.firstObservedAtLocal).not.toBe(record.candleCloseTime);
      expect(record.observationIndex).toBe(index + 1);
      expect(record.revisionClass).toBe("first-observation");
      expect("completed" in record).toBe(false);
      expect("final" in record).toBe(false);
      expect("closedMinute" in record).toBe(false);
      expect("openTimeMs" in record).toBe(false);
    }
  });

  it("drops the current in-progress minute from the same backfill response", async () => {
    const currentOpen = Date.parse("2026-09-07T14:00:00.000Z");
    const harness = createSidecarHarness({
      fetch: async () => ({
        ok: true,
        status: 200,
        body: [...elevenClosedMinutes(), tuple(currentOpen, 111_000)],
        requestStartedAtLocal: iso(PROCESS_START_MS),
      }),
    });
    await harness.sidecar.runStartupBackfill();
    expect(harness.records).toHaveLength(11);
    expect(harness.sidecar.health().inProgressDropped).toBe(1);
    expect(
      harness.records.some((record) => record.candleOpenTime === iso(currentOpen)),
    ).toBe(false);
  });

  it("rejects empty or missing runId at construction", () => {
    expect(() =>
      createSidecarHarness({
        runId: "  ",
        fetch: async () => ({
          ok: true,
          status: 200,
          body: [],
          requestStartedAtLocal: iso(PROCESS_START_MS),
        }),
      }),
    ).toThrow(/authoritative non-empty runId/);
  });
});

describe("createBtcCandles1mSidecar revisions", () => {
  it("suppresses identical repeats without rewriting the first line", async () => {
    const lastOpen = M0_OPEN_MS + 10 * LIVE_CANDLE_GRANULARITY_MS;
    const bodies: unknown[][] = [
      elevenClosedMinutes(),
      [tuple(lastOpen, 100_010, 1)],
    ];
    const harness = createSidecarHarness({
      fetch: async () => ({
        ok: true,
        status: 200,
        body: bodies.shift() ?? [],
        requestStartedAtLocal: iso(PROCESS_START_MS),
      }),
    });
    await harness.sidecar.runStartupBackfill();
    const firstLine = JSON.stringify(harness.records[10]);
    harness.setNow(PROCESS_START_MS + 15_000);
    await harness.sidecar.poll();
    expect(harness.records).toHaveLength(11);
    expect(JSON.stringify(harness.records[10])).toBe(firstLine);
    expect(harness.sidecar.health().identicalRepeatSuppressed).toBe(1);
    expect(harness.records[10]?.retrievalMethod).toBe("startup-backfill");
  });

  it("appends volume-only and OHLC revisions, preserving firstObservedAtLocal", async () => {
    const lastOpen = M0_OPEN_MS + 10 * LIVE_CANDLE_GRANULARITY_MS;
    const bodies: unknown[][] = [
      elevenClosedMinutes(),
      [tuple(lastOpen, 100_010, 9)],
      [tuple(lastOpen, 100_999, 9)],
    ];
    const harness = createSidecarHarness({
      fetch: async () => ({
        ok: true,
        status: 200,
        body: bodies.shift() ?? [],
        requestStartedAtLocal: iso(PROCESS_START_MS),
      }),
    });
    await harness.sidecar.runStartupBackfill();
    const original = JSON.stringify(harness.records[10]);
    harness.setNow(PROCESS_START_MS + 15_000);
    await harness.sidecar.poll();
    harness.setNow(PROCESS_START_MS + 30_000);
    await harness.sidecar.poll();

    expect(harness.records).toHaveLength(13);
    expect(JSON.stringify(harness.records[10])).toBe(original);
    expect(harness.records[11]?.revisionClass).toBe("volume-only");
    expect(harness.records[12]?.revisionClass).toBe("ohlc-revision");
    expect(harness.records[11]?.firstObservedAtLocal).toBe(iso(PROCESS_START_MS));
    expect(harness.records[12]?.firstObservedAtLocal).toBe(iso(PROCESS_START_MS));
    expect(harness.records[11]?.observedAtLocal).toBe(iso(PROCESS_START_MS + 15_000));
    expect(harness.records[12]?.observedAtLocal).toBe(iso(PROCESS_START_MS + 30_000));
    expect(harness.records[11]?.observationIndex).toBe(12);
    expect(harness.records[12]?.observationIndex).toBe(13);
    expect(harness.records[11]?.retrievalMethod).toBe("rest-poll");
    expect(harness.sidecar.health().volumeOnlyRevisionCount).toBe(1);
    expect(harness.sidecar.health().ohlcRevisionCount).toBe(1);
  });
});

describe("createBtcCandles1mSidecar missing and malformed data", () => {
  it("creates no row for a missing minute, empty body, or late first appearance uses later receipt", async () => {
    const missingOpen = M0_OPEN_MS + 9 * LIVE_CANDLE_GRANULARITY_MS;
    const withoutMissing = elevenClosedMinutes().filter((_, index) => index !== 9);
    const bodies: unknown[][] = [withoutMissing, [], [tuple(missingOpen, 100_009)]];
    const harness = createSidecarHarness({
      fetch: async () => ({
        ok: true,
        status: 200,
        body: bodies.shift() ?? [],
        requestStartedAtLocal: iso(PROCESS_START_MS),
      }),
    });
    await harness.sidecar.runStartupBackfill();
    expect(harness.records).toHaveLength(10);
    expect(
      harness.records.some((record) => record.candleOpenTime === iso(missingOpen)),
    ).toBe(false);

    harness.setNow(PROCESS_START_MS + 15_000);
    await harness.sidecar.poll();
    expect(harness.sidecar.health().emptySuccessCount).toBe(1);
    expect(harness.records).toHaveLength(10);

    const lateMs = PROCESS_START_MS + 30_000;
    harness.setNow(lateMs);
    await harness.sidecar.poll();
    const late = harness.records.find((record) => record.candleOpenTime === iso(missingOpen));
    expect(late?.firstObservedAtLocal).toBe(iso(lateMs));
    expect(late?.observedAtLocal).toBe(iso(lateMs));
    expect(late?.firstObservedAtLocal).not.toBe(iso(missingOpen + 59_999));
  });

  it("never persists malformed, non-finite, or invalid-envelope tuples", async () => {
    const harness = createSidecarHarness({
      fetch: async () => ({
        ok: true,
        status: 200,
        body: [
          [1, 2, 3],
          [M0_OPEN_MS / 1000, 1, 2, Number.NaN, 2, 1],
          [M0_OPEN_MS / 1000, 5, 1, 2, 2, 1],
          tuple(M0_OPEN_MS, 100_000),
        ],
        requestStartedAtLocal: iso(PROCESS_START_MS),
      }),
    });
    await harness.sidecar.runStartupBackfill();
    expect(harness.records).toHaveLength(1);
    expect(harness.sidecar.health().malformedRowCount).toBe(3);
  });

  it("normalizes out-of-order Coinbase rows by exchange open time", async () => {
    const rows = [
      tuple(M0_OPEN_MS + 2 * LIVE_CANDLE_GRANULARITY_MS, 103_000),
      tuple(M0_OPEN_MS, 101_000),
      tuple(M0_OPEN_MS + LIVE_CANDLE_GRANULARITY_MS, 102_000),
    ];
    const harness = createSidecarHarness({
      fetch: async () => ({
        ok: true,
        status: 200,
        body: rows,
        requestStartedAtLocal: iso(PROCESS_START_MS),
      }),
    });
    await harness.sidecar.runStartupBackfill();
    expect(harness.records.map((record) => record.close)).toEqual([
      101_000,
      102_000,
      103_000,
    ]);
  });
});

describe("createBtcCandles1mSidecar HTTP isolation and recovery", () => {
  it("records 429/500/timeout/connection failures without writing rows, then recovers", async () => {
    const outcomes: CompletedCandleFetchResult[] = [
      { ok: false, kind: "http-429", status: 429, requestStartedAtLocal: iso(PROCESS_START_MS) },
      { ok: false, kind: "http-5xx", status: 500, requestStartedAtLocal: iso(PROCESS_START_MS) },
      { ok: false, kind: "timeout", status: null, requestStartedAtLocal: iso(PROCESS_START_MS) },
      {
        ok: false,
        kind: "connection-failure",
        status: null,
        requestStartedAtLocal: iso(PROCESS_START_MS),
      },
      {
        ok: true,
        status: 200,
        body: elevenClosedMinutes(),
        requestStartedAtLocal: iso(PROCESS_START_MS),
      },
    ];
    const harness = createSidecarHarness({
      fetch: async () => outcomes.shift()!,
    });

    await harness.sidecar.runStartupBackfill();
    expect(harness.records).toHaveLength(0);
    await harness.sidecar.poll();
    await harness.sidecar.poll();
    await harness.sidecar.poll();
    expect(harness.sidecar.health().status).toBe("degraded");
    expect(harness.sidecar.health().http429Count).toBe(1);
    expect(harness.sidecar.health().http5xxCount).toBe(1);
    expect(harness.sidecar.health().timeoutCount).toBe(1);
    expect(harness.sidecar.health().connectionFailureCount).toBe(1);

    await harness.sidecar.poll();
    expect(harness.records).toHaveLength(11);
    expect(harness.sidecar.health().status).toBe("healthy");
    expect(harness.sidecar.health().restPollRecords).toBe(11);
  });
});

describe("createBtcCandles1mSidecar shutdown and restart isolation", () => {
  it("clears the scheduler and starts no new polls after shuttingDown", async () => {
    let intervalFn: (() => void) | null = null;
    let cleared = 0;
    const harness = createSidecarHarness({
      fetch: async () => ({
        ok: true,
        status: 200,
        body: elevenClosedMinutes(),
        requestStartedAtLocal: iso(PROCESS_START_MS),
      }),
    });
    await harness.sidecar.runStartupBackfill();
    harness.sidecar.startScheduler({
      setInterval: (fn) => {
        intervalFn = fn;
        return 7;
      },
      clearInterval: () => {
        cleared += 1;
      },
    });
    expect(harness.sidecar.hasScheduler()).toBe(true);
    harness.sidecar.setShuttingDown();
    harness.sidecar.stopScheduler();
    expect(cleared).toBe(1);
    const before = harness.records.length;
    intervalFn?.();
    await harness.sidecar.poll();
    expect(harness.records).toHaveLength(before);
  });

  it("allows an in-flight request started before shutdown to append a complete row", async () => {
    let resolveFetch!: (value: CompletedCandleFetchResult) => void;
    const held = new Promise<CompletedCandleFetchResult>((resolve) => {
      resolveFetch = resolve;
    });
    const harness = createSidecarHarness({
      fetch: async (request) => held.then((result) => ({
        ...result,
        requestStartedAtLocal: request.requestStartedAtLocal,
      })),
    });
    const pending = harness.sidecar.runStartupBackfill();
    harness.sidecar.setShuttingDown();
    resolveFetch({
      ok: true,
      status: 200,
      body: elevenClosedMinutes(),
      requestStartedAtLocal: iso(PROCESS_START_MS),
    });
    await pending;
    await harness.sidecar.awaitInFlight();
    expect(harness.records).toHaveLength(11);
    await harness.sidecar.poll();
    expect(harness.records).toHaveLength(11);
  });

  it("does not reuse firstObservedAtLocal or processEpochId across runs", async () => {
    const fetch: FetchCompletedCandles = async () => ({
      ok: true,
      status: 200,
      body: [tuple(M0_OPEN_MS + 10 * LIVE_CANDLE_GRANULARITY_MS, 100_010)],
      requestStartedAtLocal: iso(PROCESS_START_MS),
    });
    const first = createSidecarHarness({ fetch, processEpochId: "epoch-1", runId: "run-A" });
    await first.sidecar.runStartupBackfill();
    const second = createSidecarHarness({
      fetch,
      processEpochId: "epoch-2",
      runId: "run-B",
      nowMs: PROCESS_START_MS + 3_600_000,
    });
    await second.sidecar.runStartupBackfill();
    expect(second.records[0]?.runId).toBe("run-B");
    expect(second.records[0]?.processEpochId).toBe("epoch-2");
    expect(second.records[0]?.firstObservedAtLocal).toBe(iso(PROCESS_START_MS + 3_600_000));
    expect(second.records[0]?.firstObservedAtLocal).not.toBe(
      first.records[0]?.firstObservedAtLocal,
    );
  });
});
