import { describe, expect, it, vi } from "vitest";

import { DataSource } from "@/lib/data/provenance";
import { createInMemoryBtcHistoricalBronzeProvider } from "@/lib/data/importJobs/providers/btc";

import {
  BtcHistoricalHttpAdapter,
  BtcHistoricalHttpAdapterError,
  buildBinanceKlinesUrl,
} from "./BtcHistoricalHttpAdapter";
import {
  BtcHistoricalImporterErrorCode,
  BtcHistoricalInterval,
  createBtcHistoricalImporter,
} from "./index";
import type {
  BtcHistoricalHttpClient,
  BtcHistoricalHttpFetchKlinesInput,
  GetHistoricalBarsInput,
} from "./btcHistoricalImporterTypes";

const START_TIME = "2026-06-26T23:15:00.000Z";
const END_TIME = "2026-06-26T23:17:00.000Z";
const OPEN_TIME_MS = Date.parse("2026-06-26T23:15:00.000Z");
const CLOSE_TIME_MS = Date.parse("2026-06-26T23:15:59.999Z");
const OPEN_TIME_MS_2 = Date.parse("2026-06-26T23:16:00.000Z");
const CLOSE_TIME_MS_2 = Date.parse("2026-06-26T23:16:59.999Z");

function sampleKlineRow(
  openTimeMs: number,
  closeTimeMs: number,
  overrides: {
    open?: string;
    high?: string;
    low?: string;
    close?: string;
    volume?: string;
  } = {},
): unknown[] {
  return [
    openTimeMs,
    overrides.open ?? "59980.50",
    overrides.high ?? "60010.25",
    overrides.low ?? "59960.00",
    overrides.close ?? "59995.75",
    overrides.volume ?? "12.5",
    closeTimeMs,
  ];
}

function createFakeHttpClient(
  handler: (input: BtcHistoricalHttpFetchKlinesInput) => unknown,
): BtcHistoricalHttpClient {
  return {
    fetchKlines: vi.fn(async (input) => handler(input)),
  };
}

function createImporter(httpClient: BtcHistoricalHttpClient) {
  return createBtcHistoricalImporter({
    httpClient,
    source: DataSource.BINANCE_SPOT,
  });
}

function baseInput(
  overrides: Partial<GetHistoricalBarsInput> = {},
): GetHistoricalBarsInput {
  return {
    symbol: "BTCUSDT",
    interval: BtcHistoricalInterval.ONE_MINUTE,
    startTime: START_TIME,
    endTime: END_TIME,
    ...overrides,
  };
}

function snapshotInput(input: GetHistoricalBarsInput): string {
  return JSON.stringify(input);
}

describe("createBtcHistoricalImporter", () => {
  it("fetches and maps one kline", async () => {
    const httpClient = createFakeHttpClient(() => [
      sampleKlineRow(OPEN_TIME_MS, CLOSE_TIME_MS),
    ]);
    const importer = createImporter(httpClient);

    const bars = await importer.getHistoricalBars(baseInput());

    expect(bars).toHaveLength(1);
    expect(bars[0]).toEqual({
      openTime: "2026-06-26T23:15:00.000Z",
      closeTime: "2026-06-26T23:15:59.999Z",
      openUsd: 59_980.5,
      highUsd: 60_010.25,
      lowUsd: 59_960,
      closeUsd: 59_995.75,
      volume: 12.5,
      source: DataSource.BINANCE_SPOT,
    });
  });

  it("fetches and maps multiple klines in deterministic order", async () => {
    const httpClient = createFakeHttpClient(() => [
      sampleKlineRow(OPEN_TIME_MS_2, CLOSE_TIME_MS_2),
      sampleKlineRow(OPEN_TIME_MS, CLOSE_TIME_MS),
    ]);
    const importer = createImporter(httpClient);

    const bars = await importer.getHistoricalBars(baseInput());

    expect(bars.map((bar) => bar.openTime)).toEqual([
      "2026-06-26T23:15:00.000Z",
      "2026-06-26T23:16:00.000Z",
    ]);
  });

  it("returns deterministic ordering for repeated calls", async () => {
    const payload = [
      sampleKlineRow(OPEN_TIME_MS_2, CLOSE_TIME_MS_2),
      sampleKlineRow(OPEN_TIME_MS, CLOSE_TIME_MS),
    ];
    const importer = createImporter(createFakeHttpClient(() => payload));

    const first = await importer.getHistoricalBars(baseInput());
    const second = await importer.getHistoricalBars(baseInput());

    expect(first.map((bar) => bar.openTime)).toEqual(
      second.map((bar) => bar.openTime),
    );
  });

  it("rejects malformed responses", async () => {
    const importer = createImporter(createFakeHttpClient(() => ({ rows: [] })));

    await expect(importer.getHistoricalBars(baseInput())).rejects.toMatchObject({
      code: BtcHistoricalImporterErrorCode.MALFORMED_RESPONSE,
    });
  });

  it("rejects invalid OHLC relationships", async () => {
    const importer = createImporter(createFakeHttpClient(() => [
      sampleKlineRow(OPEN_TIME_MS, CLOSE_TIME_MS, { high: "59000.00" }),
    ]));

    await expect(importer.getHistoricalBars(baseInput())).rejects.toMatchObject({
      code: BtcHistoricalImporterErrorCode.INVALID_OHLC,
    });
  });

  it("rejects invalid timestamps in the response", async () => {
    const importer = createImporter(createFakeHttpClient(() => [
      ["not-a-number", "59980.50", "60010.25", "59960.00", "59995.75", "12.5", CLOSE_TIME_MS],
    ]));

    await expect(importer.getHistoricalBars(baseInput())).rejects.toMatchObject({
      code: BtcHistoricalImporterErrorCode.MALFORMED_RESPONSE,
    });
  });

  it("propagates HTTP client errors", async () => {
    const importer = createImporter({
      fetchKlines: vi.fn(async () => {
        throw new Error("upstream unavailable");
      }),
    });

    await expect(importer.getHistoricalBars(baseInput())).rejects.toThrow(
      "upstream unavailable",
    );
  });

  it("does not call global fetch in importer tests", async () => {
    const globalFetch = vi.spyOn(globalThis, "fetch");
    const httpClient = createFakeHttpClient(() => []);
    const importer = createImporter(httpClient);

    await importer.getHistoricalBars(baseInput());

    expect(globalFetch).not.toHaveBeenCalled();
    globalFetch.mockRestore();
  });

  it("does not mutate the input object", async () => {
    const input = baseInput();
    const before = snapshotInput(input);
    const importer = createImporter(createFakeHttpClient(() => []));

    await importer.getHistoricalBars(input);

    expect(snapshotInput(input)).toBe(before);
  });

  it("returns an empty array for an empty response", async () => {
    const importer = createImporter(createFakeHttpClient(() => []));

    const bars = await importer.getHistoricalBars(baseInput());

    expect(bars).toEqual([]);
  });

  it("feeds mapped bars into the in-memory bronze provider", async () => {
    const importer = createImporter(createFakeHttpClient(() => [
      sampleKlineRow(OPEN_TIME_MS, CLOSE_TIME_MS),
    ]));
    const bars = await importer.getHistoricalBars(baseInput());
    const provider = createInMemoryBtcHistoricalBronzeProvider({ bars });
    const records = provider.importBtcKlineRecords({
      marketTicker: "KXBTC15M-26JUN262315-15",
      startTime: START_TIME,
      endTime: END_TIME,
      collectionTime: "2026-06-27T01:00:00.000Z",
      observedAt: "2026-06-27T01:00:05.000Z",
    });

    expect(records).toHaveLength(1);
    expect(records[0]!.ticker).toBe("KXBTC15M-26JUN262315-15");
  });
});

describe("BtcHistoricalHttpAdapter", () => {
  function mockResponse(status: number, body: string): Response {
    return {
      status,
      ok: status >= 200 && status < 300,
      text: async () => body,
    } as Response;
  }

  it("requests Binance-compatible kline URLs through injected fetch", async () => {
    const fetchInput = {
      symbol: "BTCUSDT",
      interval: BtcHistoricalInterval.ONE_MINUTE,
      startTimeMs: OPEN_TIME_MS,
      endTimeMs: CLOSE_TIME_MS_2,
    };
    const expectedUrl = buildBinanceKlinesUrl("https://example.test", fetchInput);
    const fetchImpl = vi.fn(async () =>
      mockResponse(200, JSON.stringify([sampleKlineRow(OPEN_TIME_MS, CLOSE_TIME_MS)])),
    );
    const adapter = new BtcHistoricalHttpAdapter({
      fetchImpl,
      baseUrl: "https://example.test",
    });

    const body = await adapter.fetchKlines(fetchInput);

    expect(Array.isArray(body)).toBe(true);
    expect(fetchImpl).toHaveBeenCalledWith(
      expectedUrl,
      expect.objectContaining({
        method: "GET",
        cache: "no-store",
      }),
    );
  });

  it("throws on HTTP errors", async () => {
    const adapter = new BtcHistoricalHttpAdapter({
      fetchImpl: vi.fn(async () => mockResponse(503, "upstream unavailable")),
      baseUrl: "https://example.test",
    });

    await expect(
      adapter.fetchKlines({
        symbol: "BTCUSDT",
        interval: BtcHistoricalInterval.ONE_MINUTE,
        startTimeMs: OPEN_TIME_MS,
        endTimeMs: CLOSE_TIME_MS_2,
      }),
    ).rejects.toThrow(BtcHistoricalHttpAdapterError);
  });
});
