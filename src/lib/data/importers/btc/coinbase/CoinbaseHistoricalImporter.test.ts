import { describe, expect, it, vi } from "vitest";

import { DataSource } from "@/lib/data/provenance";
import { coinbaseCandlesFixture } from "@/features/btc-feed/providers/fixtures/coinbaseCandles.fixture";

import { BtcHistoricalImporterErrorCode, BtcHistoricalInterval } from "../btcHistoricalImporterTypes";
import type { GetHistoricalBarsInput } from "../btcHistoricalImporterTypes";
import {
  createCoinbaseHistoricalImporter,
} from "./CoinbaseHistoricalImporter";
import {
  CoinbaseHistoricalHttpAdapter,
  CoinbaseHistoricalHttpAdapterError,
  buildCoinbaseCandlesUrl,
} from "./CoinbaseHistoricalHttpAdapter";
import type {
  CoinbaseHistoricalHttpClient,
  CoinbaseHistoricalHttpFetchCandlesInput,
} from "./coinbaseHistoricalImporterTypes";
import { COINBASE_MAX_CANDLES_PER_REQUEST } from "./coinbaseHistoricalImporterTypes";

const START_TIME = "2026-06-26T23:15:00.000Z";
const END_TIME = "2026-06-26T23:17:00.000Z";
const OPEN_TIME_SEC = Math.floor(Date.parse(START_TIME) / 1000);
const OPEN_TIME_MS = OPEN_TIME_SEC * 1000;
const CLOSE_TIME_MS = OPEN_TIME_MS + 60_000 - 1;
const OPEN_TIME_SEC_2 = OPEN_TIME_SEC + 60;
const OPEN_TIME_MS_2 = OPEN_TIME_SEC_2 * 1000;

function coinbaseRow(
  timeSec: number,
  overrides: {
    low?: number;
    high?: number;
    open?: number;
    close?: number;
    volume?: number;
  } = {},
): number[] {
  return [
    timeSec,
    overrides.low ?? 59_960,
    overrides.high ?? 60_010.25,
    overrides.open ?? 59_980.5,
    overrides.close ?? 59_995.75,
    overrides.volume ?? 12.5,
  ];
}

function createFakeHttpClient(
  handler: (input: CoinbaseHistoricalHttpFetchCandlesInput) => unknown,
): CoinbaseHistoricalHttpClient {
  return {
    fetchCandles: vi.fn(async (input) => handler(input)),
  };
}

function createImporter(httpClient: CoinbaseHistoricalHttpClient) {
  return createCoinbaseHistoricalImporter({ httpClient });
}

function baseInput(
  overrides: Partial<GetHistoricalBarsInput> = {},
): GetHistoricalBarsInput {
  return {
    symbol: "BTC-USD",
    interval: BtcHistoricalInterval.ONE_MINUTE,
    startTime: START_TIME,
    endTime: END_TIME,
    ...overrides,
  };
}

describe("createCoinbaseHistoricalImporter", () => {
  it("maps a single candle", async () => {
    const importer = createImporter(
      createFakeHttpClient(() => [coinbaseRow(OPEN_TIME_SEC)]),
    );

    const bars = await importer.getHistoricalBars(baseInput());

    expect(bars).toHaveLength(1);
    expect(bars[0]).toEqual({
      openTime: START_TIME,
      closeTime: new Date(CLOSE_TIME_MS).toISOString(),
      openUsd: 59_980.5,
      highUsd: 60_010.25,
      lowUsd: 59_960,
      closeUsd: 59_995.75,
      volume: 12.5,
      source: DataSource.COINBASE_SPOT,
    });
  });

  it("maps multiple candles in deterministic order", async () => {
    const importer = createImporter(
      createFakeHttpClient(() => [
        coinbaseRow(OPEN_TIME_SEC_2),
        coinbaseRow(OPEN_TIME_SEC),
      ]),
    );

    const bars = await importer.getHistoricalBars(baseInput());

    expect(bars.map((bar) => bar.openTime)).toEqual([
      START_TIME,
      new Date(OPEN_TIME_MS_2).toISOString(),
    ]);
  });

  it("chunks requests for windows larger than 300 candles", async () => {
    const granularitySeconds = 60;
    const windowStartMs = Date.parse("2026-06-26T00:00:00.000Z");
    const candleCount = COINBASE_MAX_CANDLES_PER_REQUEST + 1;
    const windowEndMs = windowStartMs + candleCount * granularitySeconds * 1000;
    const calls: CoinbaseHistoricalHttpFetchCandlesInput[] = [];

    const importer = createImporter(
      createFakeHttpClient((input) => {
        calls.push(input);
        const chunkStartMs = Date.parse(input.startTime);
        const chunkEndMs = Date.parse(input.endTime);
        const rows: number[][] = [];

        for (
          let cursor = chunkStartMs;
          cursor < chunkEndMs;
          cursor += granularitySeconds * 1000
        ) {
          rows.push(coinbaseRow(Math.floor(cursor / 1000)));
        }

        return rows;
      }),
    );

    const bars = await importer.getHistoricalBars(
      baseInput({
        startTime: new Date(windowStartMs).toISOString(),
        endTime: new Date(windowEndMs).toISOString(),
      }),
    );

    expect(calls).toHaveLength(2);
    expect(bars).toHaveLength(candleCount);
  });

  it("merges chunked responses in openTime order", async () => {
    const windowStartMs = Date.parse("2026-06-26T00:00:00.000Z");
    const windowEndMs = windowStartMs + 301 * 60_000;
    let callIndex = 0;

    const importer = createImporter(
      createFakeHttpClient((input) => {
        callIndex += 1;
        const chunkStartMs = Date.parse(input.startTime);

        if (callIndex === 1) {
          return [
            coinbaseRow(Math.floor((chunkStartMs + 299 * 60_000) / 1000)),
            coinbaseRow(Math.floor((chunkStartMs + 298 * 60_000) / 1000)),
          ];
        }

        return [
          coinbaseRow(Math.floor((chunkStartMs + 60_000) / 1000)),
          coinbaseRow(Math.floor(chunkStartMs / 1000)),
        ];
      }),
    );

    const bars = await importer.getHistoricalBars(
      baseInput({
        startTime: new Date(windowStartMs).toISOString(),
        endTime: new Date(windowEndMs).toISOString(),
      }),
    );

    expect(bars.map((bar) => bar.openTime)).toEqual(
      [...bars].map((bar) => bar.openTime).sort((left, right) => left.localeCompare(right)),
    );
    expect(bars[0]!.openTime.localeCompare(bars[bars.length - 1]!.openTime)).toBeLessThan(0);
  });

  it("removes duplicate candles across chunk boundaries", async () => {
    const windowStartMs = Date.parse("2026-06-26T00:00:00.000Z");
    const windowEndMs = windowStartMs + 301 * 60_000;
    const sharedOpenTimeMs = windowStartMs + 100 * 60_000;
    const sharedOpenTime = new Date(sharedOpenTimeMs).toISOString();
    const sharedTimeSec = Math.floor(sharedOpenTimeMs / 1000);
    let callCount = 0;

    const importer = createImporter(
      createFakeHttpClient(() => {
        callCount += 1;

        if (callCount === 1) {
          return [coinbaseRow(sharedTimeSec, { close: 59_990 })];
        }

        return [
          coinbaseRow(sharedTimeSec, { close: 60_001 }),
          coinbaseRow(sharedTimeSec + 60, { close: 60_010 }),
        ];
      }),
    );

    const bars = await importer.getHistoricalBars(
      baseInput({
        startTime: new Date(windowStartMs).toISOString(),
        endTime: new Date(windowEndMs).toISOString(),
      }),
    );

    const matching = bars.filter((bar) => bar.openTime === sharedOpenTime);
    expect(matching).toHaveLength(1);
    expect(matching[0]?.closeUsd).toBe(60_001);
  });

  it("filters returned bars to the requested window", async () => {
    const beforeWindowSec = OPEN_TIME_SEC - 120;
    const afterWindowSec = Math.floor(Date.parse(END_TIME) / 1000);

    const importer = createImporter(
      createFakeHttpClient(() => [
        coinbaseRow(beforeWindowSec),
        coinbaseRow(OPEN_TIME_SEC),
        coinbaseRow(OPEN_TIME_SEC_2),
        coinbaseRow(afterWindowSec),
      ]),
    );

    const bars = await importer.getHistoricalBars(baseInput());

    expect(bars.map((bar) => bar.openTime)).toEqual([
      START_TIME,
      new Date(OPEN_TIME_MS_2).toISOString(),
    ]);
  });

  it("returns deterministic ordering for repeated calls", async () => {
    const payload = [coinbaseRow(OPEN_TIME_SEC_2), coinbaseRow(OPEN_TIME_SEC)];
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

  it("rejects invalid timestamps in the response", async () => {
    const importer = createImporter(
      createFakeHttpClient(() => [["not-a-number", 1, 2, 3, 4, 5]]),
    );

    await expect(importer.getHistoricalBars(baseInput())).rejects.toMatchObject({
      code: BtcHistoricalImporterErrorCode.MALFORMED_RESPONSE,
    });
  });

  it("rejects invalid OHLC relationships", async () => {
    const importer = createImporter(
      createFakeHttpClient(() => [coinbaseRow(OPEN_TIME_SEC, { high: 59_000 })]),
    );

    await expect(importer.getHistoricalBars(baseInput())).rejects.toMatchObject({
      code: BtcHistoricalImporterErrorCode.INVALID_OHLC,
    });
  });

  it("rejects invalid volume", async () => {
    const importer = createImporter(
      createFakeHttpClient(() => [coinbaseRow(OPEN_TIME_SEC, { volume: -1 })]),
    );

    await expect(importer.getHistoricalBars(baseInput())).rejects.toMatchObject({
      code: BtcHistoricalImporterErrorCode.INVALID_VOLUME,
    });
  });

  it("rejects invalid request timestamps", async () => {
    const importer = createImporter(createFakeHttpClient(() => []));

    await expect(
      importer.getHistoricalBars(baseInput({ startTime: "not-a-timestamp" })),
    ).rejects.toMatchObject({
      code: BtcHistoricalImporterErrorCode.INVALID_TIMESTAMP,
    });
  });

  it("propagates HTTP client errors", async () => {
    const importer = createImporter({
      fetchCandles: vi.fn(async () => {
        throw new Error("upstream unavailable");
      }),
    });

    await expect(importer.getHistoricalBars(baseInput())).rejects.toThrow(
      "upstream unavailable",
    );
  });

  it("uses injected fetch through the HTTP adapter without global fetch", async () => {
    const globalFetch = vi.spyOn(globalThis, "fetch");
    const fetchImpl = vi.fn(async () =>
      ({
        status: 200,
        ok: true,
        text: async () => JSON.stringify([coinbaseRow(OPEN_TIME_SEC)]),
      }) as Response,
    );
    const adapter = new CoinbaseHistoricalHttpAdapter({
      fetchImpl,
      baseUrl: "https://example.test",
    });
    const importer = createCoinbaseHistoricalImporter({ httpClient: adapter });

    await importer.getHistoricalBars(baseInput());

    expect(fetchImpl).toHaveBeenCalled();
    expect(globalFetch).not.toHaveBeenCalled();
    globalFetch.mockRestore();
  });

  it("returns deeply frozen immutable bars", async () => {
    const importer = createImporter(
      createFakeHttpClient(() => [coinbaseRow(OPEN_TIME_SEC)]),
    );

    const bars = await importer.getHistoricalBars(baseInput());

    expect(Object.isFrozen(bars)).toBe(true);
    expect(Object.isFrozen(bars[0])).toBe(true);
    expect(() => {
      (bars[0] as { openUsd: number }).openUsd = 1;
    }).toThrow();
  });

  it("maps real-shaped Coinbase fixture rows", async () => {
    const importer = createImporter(
      createFakeHttpClient(() => [...coinbaseCandlesFixture]),
    );

    const bars = await importer.getHistoricalBars(
      baseInput({
        startTime: "2024-06-26T17:00:00.000Z",
        endTime: "2024-06-26T17:05:00.000Z",
      }),
    );

    expect(bars.length).toBeGreaterThan(0);
    expect(bars.every((bar) => bar.source === DataSource.COINBASE_SPOT)).toBe(true);
  });
});

describe("CoinbaseHistoricalHttpAdapter", () => {
  function mockResponse(status: number, body: string): Response {
    return {
      status,
      ok: status >= 200 && status < 300,
      text: async () => body,
    } as Response;
  }

  it("requests Coinbase candles URLs through injected fetch", async () => {
    const fetchInput = {
      productId: "BTC-USD",
      granularity: 60,
      startTime: START_TIME,
      endTime: END_TIME,
    };
    const expectedUrl = buildCoinbaseCandlesUrl("https://example.test", fetchInput);
    const fetchImpl = vi.fn(async () =>
      mockResponse(200, JSON.stringify([coinbaseRow(OPEN_TIME_SEC)])),
    );
    const adapter = new CoinbaseHistoricalHttpAdapter({
      fetchImpl,
      baseUrl: "https://example.test",
    });

    const body = await adapter.fetchCandles(fetchInput);

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
    const adapter = new CoinbaseHistoricalHttpAdapter({
      fetchImpl: vi.fn(async () => mockResponse(503, "upstream unavailable")),
      baseUrl: "https://example.test",
    });

    await expect(
      adapter.fetchCandles({
        productId: "BTC-USD",
        granularity: 60,
        startTime: START_TIME,
        endTime: END_TIME,
      }),
    ).rejects.toThrow(CoinbaseHistoricalHttpAdapterError);
  });
});
