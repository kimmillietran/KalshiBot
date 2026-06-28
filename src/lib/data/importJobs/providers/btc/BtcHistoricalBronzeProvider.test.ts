import { describe, expect, it } from "vitest";

import { DATASET_BRONZE_CONTENT_TYPE } from "@/lib/data/datasets/datasetTypes";
import { DataSource } from "@/lib/data/provenance";

import {
  BtcHistoricalBronzeProviderError,
  BtcHistoricalBronzeProviderErrorCode,
} from "./btcHistoricalBronzeProviderTypes";
import type { BtcHistoricalBar } from "./btcHistoricalBronzeProviderTypes";
import {
  mapBtcHistoricalBarToBronzeRecord,
  serializeBtcBronzeRecords,
} from "./BtcKlineBronzeMapper";
import { createInMemoryBtcHistoricalBronzeProvider } from "./InMemoryBtcHistoricalBronzeProvider";

const MARKET_TICKER = "KXBTC15M-26JUN262315-15";
const COLLECTION_TIME = "2026-06-27T01:00:00.000Z";
const OBSERVED_AT = "2026-06-27T01:00:05.000Z";
const START_TIME = "2026-06-26T23:15:00.000Z";
const END_TIME = "2026-06-26T23:30:00.000Z";

function validBar(overrides: Partial<BtcHistoricalBar> = {}): BtcHistoricalBar {
  return {
    openTime: "2026-06-26T23:15:00.000Z",
    closeTime: "2026-06-26T23:16:00.000Z",
    openUsd: 59_980.5,
    highUsd: 60_010.25,
    lowUsd: 59_960.0,
    closeUsd: 59_995.75,
    volume: 12.5,
    source: DataSource.BINANCE_SPOT,
    ...overrides,
  };
}

function importInput(
  overrides: Partial<{
    marketTicker: string;
    startTime: string;
    endTime: string;
    collectionTime: string;
    observedAt: string;
  }> = {},
) {
  return {
    marketTicker: MARKET_TICKER,
    startTime: START_TIME,
    endTime: END_TIME,
    collectionTime: COLLECTION_TIME,
    observedAt: OBSERVED_AT,
    ...overrides,
  };
}

function snapshotBar(bar: BtcHistoricalBar): string {
  return JSON.stringify(bar);
}

describe("mapBtcHistoricalBarToBronzeRecord", () => {
  it("maps a single BTC bar to bronze", () => {
    const bar = validBar();
    const record = mapBtcHistoricalBarToBronzeRecord({
      bar,
      marketTicker: MARKET_TICKER,
      collectionTime: COLLECTION_TIME,
      observedAt: OBSERVED_AT,
    });

    expect(record.contentType).toBe(DATASET_BRONZE_CONTENT_TYPE.BTC_KLINE);
    expect(record.ticker).toBe(MARKET_TICKER);
    expect(record.eventTime).toBe(bar.closeTime);
    expect(record.collectionTime).toBe(COLLECTION_TIME);
    expect(record.observedAt).toBe(OBSERVED_AT);
    expect(record.payload).toEqual({
      open_time: bar.openTime,
      close_time: bar.closeTime,
      open_usd: bar.openUsd,
      high_usd: bar.highUsd,
      low_usd: bar.lowUsd,
      close_usd: bar.closeUsd,
      volume_btc: bar.volume,
    });
    expect(record.provenance.source).toBe(DataSource.BINANCE_SPOT);
  });

  it("maps multiple bars deterministically", () => {
    const bars = [
      validBar({
        openTime: "2026-06-26T23:17:00.000Z",
        closeTime: "2026-06-26T23:18:00.000Z",
      }),
      validBar(),
    ];

    const records = bars.map((bar) =>
      mapBtcHistoricalBarToBronzeRecord({
        bar,
        marketTicker: MARKET_TICKER,
        collectionTime: COLLECTION_TIME,
        observedAt: OBSERVED_AT,
      }),
    );

    expect(records).toHaveLength(2);
    expect(records[0]!.recordId).toMatch(/^btc-bronze-[0-9a-f]{8}$/);
    expect(records[1]!.recordId).not.toBe(records[0]!.recordId);

    const remapped = bars.map((bar) =>
      mapBtcHistoricalBarToBronzeRecord({
        bar,
        marketTicker: MARKET_TICKER,
        collectionTime: COLLECTION_TIME,
        observedAt: OBSERVED_AT,
      }),
    );

    expect(remapped.map((record) => record.recordId)).toEqual(
      records.map((record) => record.recordId),
    );
  });

  it("uses the Kalshi market ticker as the bronze ticker", () => {
    const record = mapBtcHistoricalBarToBronzeRecord({
      bar: validBar(),
      marketTicker: "KXBTC15M-CUSTOM-TICKER",
      collectionTime: COLLECTION_TIME,
      observedAt: OBSERVED_AT,
    });

    expect(record.ticker).toBe("KXBTC15M-CUSTOM-TICKER");
  });

  it("derives deterministic record IDs", () => {
    const first = mapBtcHistoricalBarToBronzeRecord({
      bar: validBar(),
      marketTicker: MARKET_TICKER,
      collectionTime: COLLECTION_TIME,
      observedAt: OBSERVED_AT,
    });
    const second = mapBtcHistoricalBarToBronzeRecord({
      bar: validBar(),
      marketTicker: MARKET_TICKER,
      collectionTime: COLLECTION_TIME,
      observedAt: OBSERVED_AT,
    });

    expect(first.recordId).toBe(second.recordId);
  });

  it("rejects invalid timestamps", () => {
    expect(() =>
      mapBtcHistoricalBarToBronzeRecord({
        bar: validBar({ openTime: "2026-06-26T23:15:00-04:00" }),
        marketTicker: MARKET_TICKER,
        collectionTime: COLLECTION_TIME,
        observedAt: OBSERVED_AT,
      }),
    ).toThrowError(
      expect.objectContaining({
        code: BtcHistoricalBronzeProviderErrorCode.INVALID_TIMESTAMP,
      }),
    );
  });

  it("rejects invalid OHLC relationships", () => {
    expect(() =>
      mapBtcHistoricalBarToBronzeRecord({
        bar: validBar({ highUsd: 59_950.0 }),
        marketTicker: MARKET_TICKER,
        collectionTime: COLLECTION_TIME,
        observedAt: OBSERVED_AT,
      }),
    ).toThrowError(
      expect.objectContaining({
        code: BtcHistoricalBronzeProviderErrorCode.INVALID_OHLC,
      }),
    );

    expect(() =>
      mapBtcHistoricalBarToBronzeRecord({
        bar: validBar({ openUsd: -1 }),
        marketTicker: MARKET_TICKER,
        collectionTime: COLLECTION_TIME,
        observedAt: OBSERVED_AT,
      }),
    ).toThrowError(
      expect.objectContaining({
        code: BtcHistoricalBronzeProviderErrorCode.NEGATIVE_PRICE,
      }),
    );
  });

  it("rejects negative volume", () => {
    expect(() =>
      mapBtcHistoricalBarToBronzeRecord({
        bar: validBar({ volume: -0.1 }),
        marketTicker: MARKET_TICKER,
        collectionTime: COLLECTION_TIME,
        observedAt: OBSERVED_AT,
      }),
    ).toThrowError(
      expect.objectContaining({
        code: BtcHistoricalBronzeProviderErrorCode.INVALID_VOLUME,
      }),
    );
  });
});

describe("createInMemoryBtcHistoricalBronzeProvider", () => {
  it("filters bars by the requested time window", () => {
    const provider = createInMemoryBtcHistoricalBronzeProvider({
      bars: [
        validBar({
          openTime: "2026-06-26T23:14:00.000Z",
          closeTime: "2026-06-26T23:15:00.000Z",
        }),
        validBar(),
        validBar({
          openTime: "2026-06-26T23:30:00.000Z",
          closeTime: "2026-06-26T23:31:00.000Z",
        }),
      ],
    });

    const records = provider.importBtcKlineRecords(importInput());

    expect(records).toHaveLength(1);
    expect(records[0]!.eventTime).toBe("2026-06-26T23:16:00.000Z");
  });

  it("returns deeply frozen output", () => {
    const provider = createInMemoryBtcHistoricalBronzeProvider({
      bars: [validBar()],
    });

    const records = provider.importBtcKlineRecords(importInput());

    expect(Object.isFrozen(records)).toBe(true);
    expect(Object.isFrozen(records[0]!)).toBe(true);
    expect(Object.isFrozen(records[0]!.payload)).toBe(true);

    expect(() => {
      (records as unknown[]).push({});
    }).toThrow();
  });

  it("does not mutate stored input bars", () => {
    const bar = validBar();
    const before = snapshotBar(bar);
    const provider = createInMemoryBtcHistoricalBronzeProvider({ bars: [bar] });

    provider.importBtcKlineRecords(importInput());

    expect(snapshotBar(bar)).toBe(before);
  });

  it("serializes mapped records stably", () => {
    const provider = createInMemoryBtcHistoricalBronzeProvider({
      bars: [validBar()],
    });
    const records = provider.importBtcKlineRecords(importInput());

    expect(serializeBtcBronzeRecords(records)).toBe(
      serializeBtcBronzeRecords(records),
    );
  });

  it("rejects invalid import input timestamps", () => {
    const provider = createInMemoryBtcHistoricalBronzeProvider({
      bars: [validBar()],
    });

    expect(() =>
      provider.importBtcKlineRecords(
        importInput({ startTime: "invalid" }),
      ),
    ).toThrowError(BtcHistoricalBronzeProviderError);
  });
});
