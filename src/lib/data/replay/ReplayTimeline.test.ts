import { describe, expect, it } from "vitest";

import { DataSource } from "@/lib/data/provenance";
import { assembleHistoricalTradingSnapshot } from "@/lib/data/snapshots/HistoricalSnapshotAssembler";
import type {
  HistoricalTradingSnapshot,
  SilverRecordEnvelope,
  SnapshotAssemblyInput,
} from "@/lib/data/snapshots/types";
import { DATA_CONTRACT_VERSION } from "@/lib/data/versioning";

import { orderReplaySnapshots, ReplayTimeline } from "./ReplayTimeline";

const SERIES = "KXBTC15M";

function envelope<T>(
  record: T,
  fetchId: string,
): SilverRecordEnvelope<T> {
  return {
    record,
    provenance: {
      source: DataSource.KALSHI_REST,
      collectionTime: record &&
        typeof record === "object" &&
        "collectionTime" in record
        ? (record.collectionTime as string)
        : "2026-06-27T01:00:00.000Z",
      observedAt: "2026-06-27T01:00:05.000Z",
      fetchId,
    },
  };
}

function createSnapshot(options: {
  ticker: string;
  eventTime: string;
  collectionTime: string;
  strikePriceUsd?: number;
}): HistoricalTradingSnapshot {
  const openTime = options.eventTime;
  const closeTime = "2026-06-26T23:30:00.000Z";
  const temporalFields = {
    eventTime: options.eventTime,
    collectionTime: options.collectionTime,
    observedAt: "2026-06-27T01:00:05.000Z",
  };

  const marketWindow = {
    ...temporalFields,
    ticker: options.ticker,
    seriesTicker: SERIES,
    openTime,
    closeTime,
    strikePriceUsd: options.strikePriceUsd ?? 59_990.31,
    status: "closed" as const,
    qualityFlags: [],
    datasetVersion: DATA_CONTRACT_VERSION,
  };

  const kalshiCandle = {
    ...temporalFields,
    ticker: options.ticker,
    openTime,
    closeTime: "2026-06-26T23:16:00.000Z",
    yesBidCents: 48,
    yesAskCents: 52,
    noBidCents: 47,
    noAskCents: 51,
    volumeContracts: 120,
    qualityFlags: [],
    datasetVersion: DATA_CONTRACT_VERSION,
  };

  const btcBar = {
    ...temporalFields,
    openTime,
    closeTime: "2026-06-26T23:16:00.000Z",
    openUsd: 59_980.5,
    highUsd: 60_010.25,
    lowUsd: 59_960.0,
    closeUsd: 59_995.75,
    volumeBtc: 12.5,
    qualityFlags: [],
    datasetVersion: DATA_CONTRACT_VERSION,
  };

  const input: SnapshotAssemblyInput = {
    marketWindow: envelope(marketWindow, `market-${options.ticker}`),
    kalshiCandles: [envelope(kalshiCandle, `candle-${options.ticker}`)],
    btcBars: [envelope(btcBar, `btc-${options.ticker}`)],
  };

  return assembleHistoricalTradingSnapshot(input);
}

describe("orderReplaySnapshots", () => {
  it("orders snapshots by eventTime, collectionTime, ticker, then serialization", () => {
    const laterEvent = createSnapshot({
      ticker: "KXBTC15M-LATER",
      eventTime: "2026-06-26T23:30:00.000Z",
      collectionTime: "2026-06-27T01:00:00.000Z",
    });
    const earlierEvent = createSnapshot({
      ticker: "KXBTC15M-EARLIER",
      eventTime: "2026-06-26T23:15:00.000Z",
      collectionTime: "2026-06-27T01:00:00.000Z",
    });
    const sameEventLaterCollection = createSnapshot({
      ticker: "KXBTC15M-SAME-EVENT",
      eventTime: "2026-06-26T23:15:00.000Z",
      collectionTime: "2026-06-27T02:00:00.000Z",
    });
    const sameEventEarlierCollection = createSnapshot({
      ticker: "KXBTC15M-AAA",
      eventTime: "2026-06-26T23:15:00.000Z",
      collectionTime: "2026-06-27T01:00:00.000Z",
    });
    const sameEventSameCollectionLaterTicker = createSnapshot({
      ticker: "KXBTC15M-ZZZ",
      eventTime: "2026-06-26T23:15:00.000Z",
      collectionTime: "2026-06-27T01:00:00.000Z",
    });

    const ordered = orderReplaySnapshots([
      laterEvent,
      sameEventLaterCollection,
      earlierEvent,
      sameEventSameCollectionLaterTicker,
      sameEventEarlierCollection,
    ]);

    expect(ordered.map((snapshot) => snapshot.ticker)).toEqual([
      "KXBTC15M-AAA",
      "KXBTC15M-EARLIER",
      "KXBTC15M-ZZZ",
      "KXBTC15M-SAME-EVENT",
      "KXBTC15M-LATER",
    ]);
  });

  it("preserves input order for duplicate timestamp and serialization ties", () => {
    const first = createSnapshot({
      ticker: "KXBTC15M-TIE",
      eventTime: "2026-06-26T23:15:00.000Z",
      collectionTime: "2026-06-27T01:00:00.000Z",
    });
    const second = createSnapshot({
      ticker: "KXBTC15M-TIE",
      eventTime: "2026-06-26T23:15:00.000Z",
      collectionTime: "2026-06-27T01:00:00.000Z",
    });

    const ordered = orderReplaySnapshots([first, second]);

    expect(ordered[0]).toBe(first);
    expect(ordered[1]).toBe(second);
  });

  it("orders snapshots with matching timestamps by ticker", () => {
    const lowerStrike = createSnapshot({
      ticker: "KXBTC15M-TIE-B",
      eventTime: "2026-06-26T23:15:00.000Z",
      collectionTime: "2026-06-27T01:00:00.000Z",
      strikePriceUsd: 59_000,
    });
    const higherStrike = createSnapshot({
      ticker: "KXBTC15M-TIE-A",
      eventTime: "2026-06-26T23:15:00.000Z",
      collectionTime: "2026-06-27T01:00:00.000Z",
      strikePriceUsd: 60_000,
    });

    const ordered = orderReplaySnapshots([lowerStrike, higherStrike]);

    expect(ordered.map((snapshot) => snapshot.ticker)).toEqual([
      "KXBTC15M-TIE-A",
      "KXBTC15M-TIE-B",
    ]);
  });

  it("breaks ties with identical timestamps and ticker using serialization", () => {
    const lowerStrike = createSnapshot({
      ticker: "KXBTC15M-SERIAL-TIE",
      eventTime: "2026-06-26T23:15:00.000Z",
      collectionTime: "2026-06-27T01:00:00.000Z",
      strikePriceUsd: 59_000,
    });
    const higherStrike = createSnapshot({
      ticker: "KXBTC15M-SERIAL-TIE",
      eventTime: "2026-06-26T23:15:00.000Z",
      collectionTime: "2026-06-27T01:00:00.000Z",
      strikePriceUsd: 60_000,
    });

    const ordered = orderReplaySnapshots([higherStrike, lowerStrike]);

    expect(ordered[0]?.marketWindow.strikePriceUsd).toBe(59_000);
    expect(ordered[1]?.marketWindow.strikePriceUsd).toBe(60_000);
  });
});

describe("ReplayTimeline", () => {
  it("exposes an empty timeline state", () => {
    const timeline = ReplayTimeline.create({ snapshots: [] });
    const state = timeline.getState();

    expect(state.isEmpty).toBe(true);
    expect(state.isComplete).toBe(true);
    expect(state.current).toBeNull();
    expect(state.hasNext).toBe(false);
    expect(state.cursor).toEqual({ index: 0, totalSteps: 0 });
    expect([...timeline.iterateAll()]).toEqual([]);
  });

  it("iterates snapshots step-by-step through immutable cursor advances", () => {
    const first = createSnapshot({
      ticker: "KXBTC15M-STEP-1",
      eventTime: "2026-06-26T23:15:00.000Z",
      collectionTime: "2026-06-27T01:00:00.000Z",
    });
    const second = createSnapshot({
      ticker: "KXBTC15M-STEP-2",
      eventTime: "2026-06-26T23:30:00.000Z",
      collectionTime: "2026-06-27T01:00:00.000Z",
    });

    const initial = ReplayTimeline.create({ snapshots: [second, first] });
    expect(initial.getState().current).toBe(first);
    expect(initial.getState().hasNext).toBe(true);
    expect(initial.getState().isComplete).toBe(false);

    const afterFirstStep = initial.stepNext();
    expect(afterFirstStep).not.toBe(initial);
    expect(afterFirstStep.getState().current).toBe(second);
    expect(afterFirstStep.getState().hasNext).toBe(false);

    const complete = afterFirstStep.stepNext();
    expect(complete.getState().current).toBeNull();
    expect(complete.getState().isComplete).toBe(true);
    expect(complete.getState().cursor).toEqual({ index: 2, totalSteps: 2 });
    expect(complete.stepNext()).toBe(complete);
  });

  it("returns frozen immutable state objects", () => {
    const snapshot = createSnapshot({
      ticker: "KXBTC15M-FROZEN",
      eventTime: "2026-06-26T23:15:00.000Z",
      collectionTime: "2026-06-27T01:00:00.000Z",
    });
    const timeline = ReplayTimeline.create({ snapshots: [snapshot] });
    const state = timeline.getState();

    expect(Object.isFrozen(state)).toBe(true);
    expect(Object.isFrozen(state.cursor)).toBe(true);
    expect(() => {
      (state as { isEmpty: boolean }).isEmpty = true;
    }).toThrow();
  });

  it("resets the cursor to the first ordered snapshot", () => {
    const first = createSnapshot({
      ticker: "KXBTC15M-RESET-1",
      eventTime: "2026-06-26T23:15:00.000Z",
      collectionTime: "2026-06-27T01:00:00.000Z",
    });
    const second = createSnapshot({
      ticker: "KXBTC15M-RESET-2",
      eventTime: "2026-06-26T23:30:00.000Z",
      collectionTime: "2026-06-27T01:00:00.000Z",
    });

    const timeline = ReplayTimeline.create({ snapshots: [second, first] });
    const advanced = timeline.stepNext().stepNext();
    const reset = advanced.reset();

    expect(reset.getState().current).toBe(first);
    expect(reset.getState().cursor).toEqual({ index: 0, totalSteps: 2 });
  });

  it("yields all ordered snapshots via iterateAll", () => {
    const first = createSnapshot({
      ticker: "KXBTC15M-ITER-1",
      eventTime: "2026-06-26T23:15:00.000Z",
      collectionTime: "2026-06-27T01:00:00.000Z",
    });
    const second = createSnapshot({
      ticker: "KXBTC15M-ITER-2",
      eventTime: "2026-06-26T23:30:00.000Z",
      collectionTime: "2026-06-27T01:00:00.000Z",
    });

    const timeline = ReplayTimeline.create({ snapshots: [second, first] });

    expect([...timeline.iterateAll()]).toEqual([first, second]);
    expect(timeline.getOrderedSnapshots()).toEqual([first, second]);
  });

  it("iterateAll is independent of cursor position", () => {
    const first = createSnapshot({
      ticker: "KXBTC15M-CURSOR-1",
      eventTime: "2026-06-26T23:15:00.000Z",
      collectionTime: "2026-06-27T01:00:00.000Z",
    });
    const second = createSnapshot({
      ticker: "KXBTC15M-CURSOR-2",
      eventTime: "2026-06-26T23:30:00.000Z",
      collectionTime: "2026-06-27T01:00:00.000Z",
    });
    const ordered = [first, second];

    const timeline = ReplayTimeline.create({ snapshots: [second, first] });
    const advanced = timeline.stepNext();

    expect([...timeline.iterateAll()]).toEqual(ordered);
    expect([...advanced.iterateAll()]).toEqual(ordered);
  });

  it("completes a single-snapshot timeline after one stepNext", () => {
    const snapshot = createSnapshot({
      ticker: "KXBTC15M-SINGLE",
      eventTime: "2026-06-26T23:15:00.000Z",
      collectionTime: "2026-06-27T01:00:00.000Z",
    });
    const timeline = ReplayTimeline.create({ snapshots: [snapshot] });

    expect(timeline.getState().current).toBe(snapshot);
    expect(timeline.getState().hasNext).toBe(false);
    expect(timeline.getState().isComplete).toBe(false);

    const complete = timeline.stepNext();

    expect(complete.getState().current).toBeNull();
    expect(complete.getState().isComplete).toBe(true);
    expect(complete.getState().cursor).toEqual({ index: 1, totalSteps: 1 });
    expect(complete.stepNext()).toBe(complete);
  });
});
