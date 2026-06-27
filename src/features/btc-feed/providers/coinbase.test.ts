import { describe, expect, it, vi } from "vitest";

import { BTC_API_TIMEOUT_MS } from "../constants";
import {
  BtcProviderMalformedResponseError,
  BtcProviderNetworkError,
  BtcProviderRateLimitError,
  BtcProviderTimeoutError,
  BtcProviderUnavailableError,
} from "./errors";
import { createCoinbaseBtcProvider } from "./coinbase";
import { coinbaseCandlesFixture } from "./fixtures/coinbaseCandles.fixture";
import type { BtcPriceProvider } from "./interface";
import { createBtcProvider } from "./index";

const statsBody = {
  open: "64000.00",
  high: "64500.00",
  low: "63800.00",
  volume: "1234.56",
  last: "64250.32",
};

const candleRows = [...coinbaseCandlesFixture];

function mockFetchSequence(responses: Array<{ status: number; body: unknown }>) {
  let call = 0;
  return vi.fn(async () => {
    const next = responses[call] ?? responses[responses.length - 1];
    call += 1;
    return {
      ok: next.status >= 200 && next.status < 300,
      status: next.status,
      statusText: "Error",
      json: async () => next.body,
    } as Response;
  });
}

describe("BtcPriceProvider contract", () => {
  it("createBtcProvider returns a provider with id and methods", () => {
    const provider: BtcPriceProvider = createBtcProvider("coinbase");
    expect(provider.id).toBe("coinbase");
    expect(typeof provider.getCurrentPrice).toBe("function");
    expect(typeof provider.getCandles).toBe("function");
  });
});

describe("createCoinbaseBtcProvider", () => {
  it("maps stats to normalized price with derived 24h change", async () => {
    const fetchImpl = mockFetchSequence([{ status: 200, body: statsBody }]);
    const provider = createCoinbaseBtcProvider({ fetchImpl });

    const price = await provider.getCurrentPrice();

    expect(price.price).toBe(64250.32);
    expect(price.change24h).toBeCloseTo(250.32, 2);
    expect(price.change24hPercent).toBeCloseTo(0.391, 2);
    expect(price.updatedAt).toMatch(/^\d{4}-/);
  });

  it("parses real-shaped numeric Coinbase candle arrays", () => {
    const fetchImpl = mockFetchSequence([{ status: 200, body: candleRows }]);
    const provider = createCoinbaseBtcProvider({ fetchImpl });

    return provider.getCandles("1m", 30).then((candles) => {
      expect(candles).toHaveLength(3);
      expect(candles[0].timestamp).toBeLessThan(candles[1].timestamp);
      expect(candles[1].close).toBe(64250.32);
      expect(candles[0].open).toBe(64180.0);
    });
  });

  it("throws BtcProviderMalformedResponseError on invalid stats JSON shape", async () => {
    const fetchImpl = mockFetchSequence([{ status: 200, body: { bad: true } }]);
    const provider = createCoinbaseBtcProvider({ fetchImpl });

    await expect(provider.getCurrentPrice()).rejects.toBeInstanceOf(
      BtcProviderMalformedResponseError,
    );
  });

  it("throws BtcProviderMalformedResponseError when payload is not an array", async () => {
    const fetchImpl = mockFetchSequence([{ status: 200, body: "not-array" }]);
    const provider = createCoinbaseBtcProvider({ fetchImpl });

    await expect(provider.getCandles("1m", 10)).rejects.toThrow(
      /payload is not an array/i,
    );
  });

  it("throws when a candle row has invalid length", async () => {
    const fetchImpl = mockFetchSequence([
      { status: 200, body: [[1719421200, 64170.12, 64200.55]] },
    ]);
    const provider = createCoinbaseBtcProvider({ fetchImpl });

    await expect(provider.getCandles("1m", 10)).rejects.toThrow(
      /invalid length/i,
    );
  });

  it("throws when OHLC values are strings (regression)", async () => {
    const fetchImpl = mockFetchSequence([
      {
        status: 200,
        body: [[1719421200, "64170.12", 64200.55, 64180.0, 64190.25, 12.5]],
      },
    ]);
    const provider = createCoinbaseBtcProvider({ fetchImpl });

    await expect(provider.getCandles("1m", 10)).rejects.toThrow(
      /low is not a valid number/i,
    );
  });

  it("throws BtcProviderRateLimitError on HTTP 429", async () => {
    const fetchImpl = mockFetchSequence([{ status: 429, body: {} }]);
    const provider = createCoinbaseBtcProvider({ fetchImpl });

    await expect(provider.getCurrentPrice()).rejects.toBeInstanceOf(
      BtcProviderRateLimitError,
    );
  });

  it("throws BtcProviderUnavailableError on HTTP 5xx", async () => {
    const fetchImpl = mockFetchSequence([{ status: 503, body: {} }]);
    const provider = createCoinbaseBtcProvider({ fetchImpl });

    await expect(provider.getCurrentPrice()).rejects.toBeInstanceOf(
      BtcProviderUnavailableError,
    );
  });

  it("throws BtcProviderUnavailableError on HTTP 451", async () => {
    const fetchImpl = mockFetchSequence([{ status: 451, body: {} }]);
    const provider = createCoinbaseBtcProvider({ fetchImpl });

    await expect(provider.getCurrentPrice()).rejects.toBeInstanceOf(
      BtcProviderUnavailableError,
    );
  });

  it("throws BtcProviderNetworkError on connection failure", async () => {
    const fetchImpl = vi.fn(() => Promise.reject(new Error("ECONNRESET")));
    const provider = createCoinbaseBtcProvider({ fetchImpl });

    await expect(provider.getCurrentPrice()).rejects.toBeInstanceOf(
      BtcProviderNetworkError,
    );
  });

  it("throws BtcProviderTimeoutError on upstream timeout", async () => {
    vi.useFakeTimers();

    const fetchImpl = vi.fn(
      (_url, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            const err = new Error("The operation was aborted");
            err.name = "AbortError";
            reject(err);
          });
        }),
    );

    const provider = createCoinbaseBtcProvider({ fetchImpl });
    const pending = provider.getCurrentPrice();
    const assertion = expect(pending).rejects.toBeInstanceOf(BtcProviderTimeoutError);

    await vi.advanceTimersByTimeAsync(BTC_API_TIMEOUT_MS + 1);
    await assertion;

    vi.useRealTimers();
  });
});
