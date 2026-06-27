import { describe, expect, it, vi } from "vitest";

import { BTC_API_TIMEOUT_MS } from "../constants";
import {
  BtcProviderMalformedResponseError,
  BtcProviderNetworkError,
  BtcProviderRateLimitError,
  BtcProviderTimeoutError,
  BtcProviderUnavailableError,
} from "./errors";
import { createKrakenBtcProvider } from "./kraken";

const tickerResult = {
  error: [],
  result: {
    XXBTZUSD: {
      a: ["64250.1", "1", "1.000"],
      b: ["64250.0", "1", "1.000"],
      c: ["64250.32", "0.001"],
      v: ["100.5", "5000.0"],
      p: ["64000.0", "64100.0"],
      t: [1000, 50000],
      l: ["63000.0", "63500.0"],
      h: ["64500.0", "65000.0"],
      o: "64000.00",
    },
  },
};

const ohlcResult = {
  error: [],
  result: {
    XXBTZUSD: [
      [1_700_000_000, "64180.0", "64200.0", "64170.0", "64190.0", "64185.0", 12, 50],
      [1_700_000_060, "64190.0", "64210.0", "64180.0", "64200.0", "64195.0", 10, 45],
    ],
  },
};

describe("createKrakenBtcProvider", () => {
  it("maps ticker to price with derived 24h change", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("/Ticker")) {
        return {
          ok: true,
          status: 200,
          json: async () => tickerResult,
        } as Response;
      }
      throw new Error(`Unexpected url: ${url}`);
    });

    const provider = createKrakenBtcProvider({ fetchImpl: fetchMock });
    const price = await provider.getCurrentPrice();

    expect(price.price).toBe(64250.32);
    expect(price.change24h).toBeCloseTo(250.32);
    expect(price.change24hPercent).toBeCloseTo(0.391125);
  });

  it("maps OHLC rows to candles", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("/OHLC")) {
        return {
          ok: true,
          status: 200,
          json: async () => ohlcResult,
        } as Response;
      }
      throw new Error(`Unexpected url: ${url}`);
    });

    const provider = createKrakenBtcProvider({ fetchImpl: fetchMock });
    const candles = await provider.getCandles("1m", 2);

    expect(candles).toHaveLength(2);
    expect(candles[0].open).toBe(64180);
    expect(candles[1].close).toBe(64200);
  });

  it("maps upstream errors to typed provider errors", async () => {
    const cases = [
      { status: 429, error: BtcProviderRateLimitError },
      { status: 503, error: BtcProviderUnavailableError },
    ] as const;

    for (const { status, error } of cases) {
      const fetchMock = vi.fn(async () => ({
        ok: false,
        status,
        json: async () => ({}),
      })) as typeof fetch;

      const provider = createKrakenBtcProvider({ fetchImpl: fetchMock });
      await expect(provider.getCurrentPrice()).rejects.toBeInstanceOf(error);
    }
  });

  it("throws on Kraken API error array", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ error: ["EGeneral:Invalid arguments"] }),
    })) as typeof fetch;

    const provider = createKrakenBtcProvider({ fetchImpl: fetchMock });
    await expect(provider.getCurrentPrice()).rejects.toBeInstanceOf(
      BtcProviderUnavailableError,
    );
  });

  it("maps network failures", async () => {
    const fetchMock = vi.fn(async () => {
      throw new TypeError("fetch failed");
    }) as typeof fetch;

    const provider = createKrakenBtcProvider({ fetchImpl: fetchMock });
    await expect(provider.getCurrentPrice()).rejects.toBeInstanceOf(
      BtcProviderNetworkError,
    );
  });

  it("maps timeout via fetchWithTimeout", async () => {
    vi.useFakeTimers();

    const fetchMock = vi.fn(
      (_url, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            const err = new Error("The operation was aborted");
            err.name = "AbortError";
            reject(err);
          });
        }),
    ) as typeof fetch;

    const provider = createKrakenBtcProvider({ fetchImpl: fetchMock });
    const promise = provider.getCurrentPrice();
    const assertion = expect(promise).rejects.toBeInstanceOf(BtcProviderTimeoutError);

    await vi.advanceTimersByTimeAsync(BTC_API_TIMEOUT_MS + 1);
    await assertion;

    vi.useRealTimers();
  });

  it("throws on malformed ticker payload", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ error: [], result: { XXBTZUSD: { c: "bad" } } }),
    })) as typeof fetch;

    const provider = createKrakenBtcProvider({ fetchImpl: fetchMock });
    await expect(provider.getCurrentPrice()).rejects.toBeInstanceOf(
      BtcProviderMalformedResponseError,
    );
  });
});
