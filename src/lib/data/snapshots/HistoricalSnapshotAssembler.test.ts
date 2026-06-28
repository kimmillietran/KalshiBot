import { describe, expect, it } from "vitest";

import { DataSource } from "@/lib/data/provenance";
import { DATA_CONTRACT_VERSION } from "@/lib/data/versioning";

import {
  assembleHistoricalTradingSnapshot,
  serializeHistoricalTradingSnapshot,
} from "./HistoricalSnapshotAssembler";
import {
  HistoricalSnapshotAssemblyError,
  SnapshotAssemblyErrorCode,
} from "./errors";
import type { SilverRecordEnvelope, SnapshotAssemblyInput } from "./types";

const EVENT_TIME = "2026-06-26T23:15:00.000Z";
const COLLECTION_TIME = "2026-06-27T01:00:00.000Z";
const OBSERVED_AT = "2026-06-27T01:00:05.000Z";
const OPEN_TIME_A = "2026-06-26T23:15:00.000Z";
const OPEN_TIME_B = "2026-06-26T23:16:00.000Z";
const OPEN_TIME_C = "2026-06-26T23:17:00.000Z";
const CLOSE_TIME_A = "2026-06-26T23:16:00.000Z";
const CLOSE_TIME_B = "2026-06-26T23:17:00.000Z";
const CLOSE_TIME_C = "2026-06-26T23:18:00.000Z";
const WINDOW_CLOSE = "2026-06-26T23:30:00.000Z";
const TICKER = "KXBTC15M-26JUN261930-30";
const SERIES = "KXBTC15M";

const temporalFields = {
  eventTime: EVENT_TIME,
  collectionTime: COLLECTION_TIME,
  observedAt: OBSERVED_AT,
};

const marketProvenance = {
  source: DataSource.KALSHI_REST,
  collectionTime: COLLECTION_TIME,
  observedAt: OBSERVED_AT,
  fetchId: "fetch-market-1",
};

const candleProvenanceA = {
  source: DataSource.KALSHI_CANDLES,
  collectionTime: COLLECTION_TIME,
  observedAt: OBSERVED_AT,
  fetchId: "fetch-candle-a",
};

const candleProvenanceB = {
  source: DataSource.KALSHI_CANDLES,
  collectionTime: COLLECTION_TIME,
  observedAt: OBSERVED_AT,
  fetchId: "fetch-candle-b",
};

const btcProvenanceA = {
  source: DataSource.BINANCE_SPOT,
  collectionTime: COLLECTION_TIME,
  observedAt: OBSERVED_AT,
  fetchId: "fetch-btc-a",
};

const settlementProvenance = {
  source: DataSource.KALSHI_REST,
  collectionTime: COLLECTION_TIME,
  observedAt: OBSERVED_AT,
  fetchId: "fetch-settlement-1",
};

const marketWindow = {
  ...temporalFields,
  ticker: TICKER,
  seriesTicker: SERIES,
  openTime: OPEN_TIME_A,
  closeTime: WINDOW_CLOSE,
  strikePriceUsd: 59_990.31,
  status: "closed" as const,
  qualityFlags: [],
  datasetVersion: DATA_CONTRACT_VERSION,
};

const kalshiCandleA = {
  ...temporalFields,
  ticker: TICKER,
  openTime: OPEN_TIME_A,
  closeTime: CLOSE_TIME_A,
  yesBidCents: 48,
  yesAskCents: 52,
  noBidCents: 47,
  noAskCents: 51,
  volumeContracts: 120,
  qualityFlags: [],
  datasetVersion: DATA_CONTRACT_VERSION,
};

const kalshiCandleB = {
  ...kalshiCandleA,
  openTime: OPEN_TIME_B,
  closeTime: CLOSE_TIME_B,
  eventTime: OPEN_TIME_B,
};

const kalshiCandleC = {
  ...kalshiCandleA,
  openTime: OPEN_TIME_C,
  closeTime: CLOSE_TIME_C,
  eventTime: OPEN_TIME_C,
};

const btcBarA = {
  ...temporalFields,
  openTime: OPEN_TIME_A,
  closeTime: CLOSE_TIME_A,
  openUsd: 59_980.5,
  highUsd: 60_010.25,
  lowUsd: 59_960.0,
  closeUsd: 59_995.75,
  volumeBtc: 12.5,
  qualityFlags: [],
  datasetVersion: DATA_CONTRACT_VERSION,
};

const settlement = {
  ...temporalFields,
  ticker: TICKER,
  strikePriceUsd: 59_990.31,
  settlementPriceUsd: 60_012.44,
  result: "yes" as const,
  settledAt: WINDOW_CLOSE,
  qualityFlags: [],
  datasetVersion: DATA_CONTRACT_VERSION,
};

function envelope<T>(
  record: T,
  provenance: SilverRecordEnvelope<T>["provenance"],
): SilverRecordEnvelope<T> {
  return { record, provenance };
}

function createValidInput(
  overrides: Partial<SnapshotAssemblyInput> = {},
): SnapshotAssemblyInput {
  return {
    marketWindow: envelope(marketWindow, marketProvenance),
    kalshiCandles: [
      envelope(kalshiCandleA, candleProvenanceA),
      envelope(kalshiCandleB, candleProvenanceB),
    ],
    btcBars: [envelope(btcBarA, btcProvenanceA)],
    settlement: envelope(settlement, settlementProvenance),
    ...overrides,
  };
}

describe("assembleHistoricalTradingSnapshot", () => {
  it("assembles a snapshot from normalized Silver records", () => {
    const snapshot = assembleHistoricalTradingSnapshot(createValidInput());

    expect(snapshot.ticker).toBe(TICKER);
    expect(snapshot.marketWindow).toEqual(marketWindow);
    expect(snapshot.kalshiCandles).toHaveLength(2);
    expect(snapshot.btcBars).toHaveLength(1);
    expect(snapshot.settlement).toEqual(settlement);
    expect(snapshot.temporal).toEqual({
      eventTime: EVENT_TIME,
      collectionTime: COLLECTION_TIME,
      observedAt: OBSERVED_AT,
    });
  });

  it("throws a deterministic error when the market window is missing", () => {
    expect(() =>
      assembleHistoricalTradingSnapshot(
        createValidInput({ marketWindow: null }),
      ),
    ).toThrow(HistoricalSnapshotAssemblyError);

    try {
      assembleHistoricalTradingSnapshot(
        createValidInput({ marketWindow: undefined }),
      );
    } catch (error) {
      expect(error).toBeInstanceOf(HistoricalSnapshotAssemblyError);
      expect((error as HistoricalSnapshotAssemblyError).code).toBe(
        SnapshotAssemblyErrorCode.MISSING_MARKET_WINDOW,
      );
      expect((error as HistoricalSnapshotAssemblyError).message).toBe(
        "Historical trading snapshot requires a market window",
      );
    }
  });

  it("throws a deterministic error when Kalshi candles are missing", () => {
    expect(() =>
      assembleHistoricalTradingSnapshot(createValidInput({ kalshiCandles: [] })),
    ).toThrow(HistoricalSnapshotAssemblyError);

    try {
      assembleHistoricalTradingSnapshot(
        createValidInput({ kalshiCandles: null }),
      );
    } catch (error) {
      expect((error as HistoricalSnapshotAssemblyError).code).toBe(
        SnapshotAssemblyErrorCode.MISSING_KALSHI_CANDLES,
      );
    }
  });

  it("allows settlement to be omitted", () => {
    const snapshot = assembleHistoricalTradingSnapshot(
      createValidInput({ settlement: undefined }),
    );

    expect(snapshot.settlement).toBeNull();
    expect(snapshot.provenance.settlement).toBeNull();
  });

  it("serializes snapshots deterministically", () => {
    const input = createValidInput();
    const first = serializeHistoricalTradingSnapshot(
      assembleHistoricalTradingSnapshot(input),
    );
    const second = serializeHistoricalTradingSnapshot(
      assembleHistoricalTradingSnapshot(input),
    );

    expect(first).toBe(second);
    expect(first.length).toBeGreaterThan(0);
  });

  it("preserves provenance from each Silver envelope", () => {
    const snapshot = assembleHistoricalTradingSnapshot(createValidInput());

    expect(snapshot.provenance.marketWindow).toEqual(marketProvenance);
    expect(snapshot.provenance.kalshiCandles).toEqual([
      candleProvenanceA,
      candleProvenanceB,
    ]);
    expect(snapshot.provenance.btcBars).toEqual([btcProvenanceA]);
    expect(snapshot.provenance.settlement).toEqual(settlementProvenance);
  });

  it("preserves input ordering for candles and bars", () => {
    const snapshot = assembleHistoricalTradingSnapshot(
      createValidInput({
        kalshiCandles: [
          envelope(kalshiCandleC, candleProvenanceB),
          envelope(kalshiCandleA, candleProvenanceA),
          envelope(kalshiCandleB, candleProvenanceB),
        ],
      }),
    );

    expect(snapshot.kalshiCandles.map((candle) => candle.openTime)).toEqual([
      OPEN_TIME_C,
      OPEN_TIME_A,
      OPEN_TIME_B,
    ]);
  });

  it("returns deeply frozen immutable outputs", () => {
    const snapshot = assembleHistoricalTradingSnapshot(createValidInput());

    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.marketWindow)).toBe(true);
    expect(Object.isFrozen(snapshot.kalshiCandles)).toBe(true);
    expect(Object.isFrozen(snapshot.btcBars)).toBe(true);
    expect(Object.isFrozen(snapshot.temporal)).toBe(true);
    expect(Object.isFrozen(snapshot.provenance)).toBe(true);
    expect(Object.isFrozen(snapshot.provenance.kalshiCandles)).toBe(true);

    expect(() => {
      (snapshot as { ticker: string }).ticker = "mutated";
    }).toThrow();
  });
});
