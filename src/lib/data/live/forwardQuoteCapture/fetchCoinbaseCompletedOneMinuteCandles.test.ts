import { describe, expect, it } from "vitest";

import { KalshiRequestTimeoutError } from "@/features/market-data/api/fetchWithTimeout";

import {
  LIVE_CANDLE_GRANULARITY_SECONDS,
  LIVE_CANDLE_PRODUCT_ID,
} from "./btcCandles1mSidecarTypes";
import {
  buildCoinbaseCompletedOneMinuteCandlesUrl,
  fetchCoinbaseCompletedOneMinuteCandles,
} from "./fetchCoinbaseCompletedOneMinuteCandles";

const REQUEST = {
  productId: LIVE_CANDLE_PRODUCT_ID,
  granularitySeconds: LIVE_CANDLE_GRANULARITY_SECONDS,
  startTime: "2026-09-07T13:45:00.000Z",
  endTime: "2026-09-07T14:00:10.000Z",
  requestStartedAtLocal: "2026-09-07T14:00:10.000Z",
} as const;

describe("buildCoinbaseCompletedOneMinuteCandlesUrl", () => {
  it("uses the public Exchange candles endpoint with granularity=60", () => {
    const url = buildCoinbaseCompletedOneMinuteCandlesUrl({
      productId: "BTC-USD",
      granularitySeconds: 60,
      startTime: REQUEST.startTime,
      endTime: REQUEST.endTime,
    });
    expect(url).toContain("https://api.exchange.coinbase.com/products/BTC-USD/candles");
    expect(url).toContain("granularity=60");
    expect(url).toContain("start=2026-09-07T13%3A45%3A00.000Z");
  });
});

describe("fetchCoinbaseCompletedOneMinuteCandles", () => {
  it("returns 200 body without calling a real network host", async () => {
    const result = await fetchCoinbaseCompletedOneMinuteCandles({
      request: REQUEST,
      fetchImpl: async (url) => {
        expect(String(url)).toContain("/products/BTC-USD/candles");
        return new Response(JSON.stringify([[1, 2, 3, 4, 5, 6]]), { status: 200 });
      },
    });
    expect(result).toEqual({
      ok: true,
      status: 200,
      body: [[1, 2, 3, 4, 5, 6]],
      requestStartedAtLocal: REQUEST.requestStartedAtLocal,
    });
  });

  it("classifies 429, 500, timeout, and connection failure", async () => {
    const tooMany = await fetchCoinbaseCompletedOneMinuteCandles({
      request: REQUEST,
      fetchImpl: async () => new Response("no", { status: 429 }),
    });
    expect(tooMany).toMatchObject({ ok: false, kind: "http-429", status: 429 });

    const server = await fetchCoinbaseCompletedOneMinuteCandles({
      request: REQUEST,
      fetchImpl: async () => new Response("no", { status: 500 }),
    });
    expect(server).toMatchObject({ ok: false, kind: "http-5xx", status: 500 });

    const timeout = await fetchCoinbaseCompletedOneMinuteCandles({
      request: REQUEST,
      fetchImpl: async () => {
        throw new KalshiRequestTimeoutError();
      },
    });
    expect(timeout).toMatchObject({ ok: false, kind: "timeout" });

    const connection = await fetchCoinbaseCompletedOneMinuteCandles({
      request: REQUEST,
      fetchImpl: async () => {
        throw new TypeError("fetch failed");
      },
    });
    expect(connection).toMatchObject({ ok: false, kind: "connection-failure" });
  });

  it("classifies malformed JSON as malformed-body", async () => {
    const result = await fetchCoinbaseCompletedOneMinuteCandles({
      request: REQUEST,
      fetchImpl: async () => new Response("{", { status: 200 }),
    });
    expect(result).toMatchObject({ ok: false, kind: "malformed-body" });
  });
});
