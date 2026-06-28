import { afterEach, describe, expect, it, vi } from "vitest";

import { DATASET_BRONZE_CONTENT_TYPE } from "@/lib/data/datasets/datasetTypes";
import { BtcHistoricalInterval } from "@/lib/data/importers/btc";
import type {
  BtcHistoricalImporter,
  BtcHistoricalImporterBar,
  GetHistoricalBarsInput,
} from "@/lib/data/importers/btc";
import { BtcHistoricalImporterError } from "@/lib/data/importers/btc";
import { DataSource } from "@/lib/data/provenance";

import type { BtcHistoricalBar } from "../btcHistoricalBronzeProviderTypes";
import { serializeBtcBronzeRecords } from "../BtcKlineBronzeMapper";

import {
  BtcImporterBronzeProviderAdapterError,
  BtcImporterBronzeProviderAdapterErrorCode,
} from "./btcImporterProviderAdapterTypes";
import { createBtcHistoricalBronzeProviderFromImporter } from "./BtcImporterBronzeProviderAdapter";

const SYMBOL = "BTCUSDT";
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

type SyncBtcHistoricalImporter = {
  getHistoricalBars: (
    input: GetHistoricalBarsInput,
  ) => readonly BtcHistoricalImporterBar[];
};

function asSyncImporter(importer: SyncBtcHistoricalImporter): BtcHistoricalImporter {
  return importer as unknown as BtcHistoricalImporter;
}

describe("createBtcHistoricalBronzeProviderFromImporter", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("calls importer with configured symbol and interval", () => {
    const getHistoricalBars = vi.fn(() => [] as readonly BtcHistoricalImporterBar[]);
    const provider = createBtcHistoricalBronzeProviderFromImporter({
      importer: asSyncImporter({ getHistoricalBars }),
      symbol: SYMBOL,
      interval: BtcHistoricalInterval.ONE_MINUTE,
    });

    provider.importBtcKlineRecords(importInput());

    expect(getHistoricalBars).toHaveBeenCalledWith({
      symbol: SYMBOL,
      interval: BtcHistoricalInterval.ONE_MINUTE,
      startTime: START_TIME,
      endTime: END_TIME,
    });
  });

  it("passes input startTime and endTime to the importer", () => {
    const getHistoricalBars = vi.fn(() => [] as readonly BtcHistoricalImporterBar[]);
    const provider = createBtcHistoricalBronzeProviderFromImporter({
      importer: asSyncImporter({ getHistoricalBars }),
      symbol: SYMBOL,
      interval: BtcHistoricalInterval.ONE_MINUTE,
    });

    const input = importInput({
      startTime: "2026-06-26T22:00:00.000Z",
      endTime: "2026-06-26T22:15:00.000Z",
    });

    provider.importBtcKlineRecords(input);

    expect(getHistoricalBars).toHaveBeenCalledWith(
      expect.objectContaining({
        startTime: "2026-06-26T22:00:00.000Z",
        endTime: "2026-06-26T22:15:00.000Z",
      }),
    );
  });

  it("maps importer bars to bronze records", () => {
    const bar = validBar();
    const provider = createBtcHistoricalBronzeProviderFromImporter({
      importer: asSyncImporter({
        getHistoricalBars: () => [bar],
      }),
      symbol: SYMBOL,
      interval: BtcHistoricalInterval.ONE_MINUTE,
    });

    const records = provider.importBtcKlineRecords(importInput());

    expect(records).toHaveLength(1);
    expect(records[0]!.contentType).toBe(DATASET_BRONZE_CONTENT_TYPE.BTC_KLINE);
    expect(records[0]!.payload).toEqual({
      open_time: bar.openTime,
      close_time: bar.closeTime,
      open_usd: bar.openUsd,
      high_usd: bar.highUsd,
      low_usd: bar.lowUsd,
      close_usd: bar.closeUsd,
      volume_btc: bar.volume,
    });
  });

  it("uses the Kalshi marketTicker as the bronze ticker", () => {
    const provider = createBtcHistoricalBronzeProviderFromImporter({
      importer: asSyncImporter({
        getHistoricalBars: () => [validBar()],
      }),
      symbol: SYMBOL,
      interval: BtcHistoricalInterval.ONE_MINUTE,
    });

    const records = provider.importBtcKlineRecords(
      importInput({ marketTicker: "KXBTC15M-CUSTOM-TICKER" }),
    );

    expect(records[0]!.ticker).toBe("KXBTC15M-CUSTOM-TICKER");
  });

  it("uses input collectionTime and observedAt", () => {
    const provider = createBtcHistoricalBronzeProviderFromImporter({
      importer: asSyncImporter({
        getHistoricalBars: () => [validBar()],
      }),
      symbol: SYMBOL,
      interval: BtcHistoricalInterval.ONE_MINUTE,
    });

    const records = provider.importBtcKlineRecords(
      importInput({
        collectionTime: "2026-06-27T02:00:00.000Z",
        observedAt: "2026-06-27T02:00:10.000Z",
      }),
    );

    expect(records[0]!.collectionTime).toBe("2026-06-27T02:00:00.000Z");
    expect(records[0]!.observedAt).toBe("2026-06-27T02:00:10.000Z");
  });

  it("returns records in deterministic order", () => {
    const bars = [
      validBar({
        openTime: "2026-06-26T23:17:00.000Z",
        closeTime: "2026-06-26T23:18:00.000Z",
      }),
      validBar(),
      validBar({
        openTime: "2026-06-26T23:16:00.000Z",
        closeTime: "2026-06-26T23:17:00.000Z",
      }),
    ];

    const provider = createBtcHistoricalBronzeProviderFromImporter({
      importer: asSyncImporter({
        getHistoricalBars: () => bars,
      }),
      symbol: SYMBOL,
      interval: BtcHistoricalInterval.ONE_MINUTE,
    });

    const records = provider.importBtcKlineRecords(importInput());

    expect(records.map((record) => record.eventTime)).toEqual([
      "2026-06-26T23:16:00.000Z",
      "2026-06-26T23:17:00.000Z",
      "2026-06-26T23:18:00.000Z",
    ]);
  });

  it("returns an empty array when the importer returns no bars", () => {
    const provider = createBtcHistoricalBronzeProviderFromImporter({
      importer: asSyncImporter({
        getHistoricalBars: () => [],
      }),
      symbol: SYMBOL,
      interval: BtcHistoricalInterval.ONE_MINUTE,
    });

    expect(provider.importBtcKlineRecords(importInput())).toEqual([]);
  });

  it("propagates importer errors", () => {
    const provider = createBtcHistoricalBronzeProviderFromImporter({
      importer: asSyncImporter({
        getHistoricalBars: () => {
          throw new BtcHistoricalImporterError(
            "malformed upstream response",
            "malformed-response",
          );
        },
      }),
      symbol: SYMBOL,
      interval: BtcHistoricalInterval.ONE_MINUTE,
    });

    expect(() => provider.importBtcKlineRecords(importInput())).toThrow(
      BtcHistoricalImporterError,
    );
  });

  it("does not mutate import input", () => {
    const provider = createBtcHistoricalBronzeProviderFromImporter({
      importer: asSyncImporter({
        getHistoricalBars: () => [validBar()],
      }),
      symbol: SYMBOL,
      interval: BtcHistoricalInterval.ONE_MINUTE,
    });

    const input = importInput();
    const before = JSON.stringify(input);

    provider.importBtcKlineRecords(input);

    expect(JSON.stringify(input)).toBe(before);
  });

  it("returns identical output for repeated identical calls", () => {
    const provider = createBtcHistoricalBronzeProviderFromImporter({
      importer: asSyncImporter({
        getHistoricalBars: () => [validBar()],
      }),
      symbol: SYMBOL,
      interval: BtcHistoricalInterval.ONE_MINUTE,
    });

    const input = importInput();
    const first = provider.importBtcKlineRecords(input);
    const second = provider.importBtcKlineRecords(input);

    expect(serializeBtcBronzeRecords(first)).toBe(serializeBtcBronzeRecords(second));
  });

  it("does not call fetch or HTTP clients inside the adapter", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const getHistoricalBars = vi.fn(() => [validBar()]);

    const provider = createBtcHistoricalBronzeProviderFromImporter({
      importer: asSyncImporter({ getHistoricalBars }),
      symbol: SYMBOL,
      interval: BtcHistoricalInterval.ONE_MINUTE,
    });

    provider.importBtcKlineRecords(importInput());

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(getHistoricalBars).toHaveBeenCalledTimes(1);
  });

  it("rejects async importer results at import time", () => {
    const provider = createBtcHistoricalBronzeProviderFromImporter({
      importer: {
        getHistoricalBars: () => Promise.resolve([validBar()]),
      },
      symbol: SYMBOL,
      interval: BtcHistoricalInterval.ONE_MINUTE,
    });

    expect(() => provider.importBtcKlineRecords(importInput())).toThrowError(
      expect.objectContaining({
        code: BtcImporterBronzeProviderAdapterErrorCode.ASYNC_IMPORTER_RESULT,
      }),
    );
    expect(() => provider.importBtcKlineRecords(importInput())).toThrowError(
      BtcImporterBronzeProviderAdapterError,
    );
  });
});
