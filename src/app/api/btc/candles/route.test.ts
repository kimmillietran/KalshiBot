import { afterEach, describe, expect, it, vi } from "vitest";

import {
  BtcProviderMalformedResponseError,
  BtcProviderNetworkError,
  BtcProviderRateLimitError,
  BtcProviderTimeoutError,
  BtcProviderUnavailableError,
  fetchBtcCandleHistory,
} from "@/features/btc-feed/api/btcServer";

import { GET } from "./route";

vi.mock("@/features/btc-feed/api/btcServer", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/btc-feed/api/btcServer")>();
  return {
    ...actual,
    fetchBtcCandleHistory: vi.fn(),
  };
});

const mockedFetch = vi.mocked(fetchBtcCandleHistory);

describe("GET /api/btc/candles", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns candle payload on success", async () => {
    mockedFetch.mockResolvedValue({
      candles: [
        {
          timestamp: 1,
          time: "12:00",
          open: 64000,
          high: 64300,
          low: 63900,
          close: 64250.32,
        },
      ],
    });

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.candles).toHaveLength(1);
  });

  it("maps timeouts to 504", async () => {
    mockedFetch.mockRejectedValue(new BtcProviderTimeoutError());

    const res = await GET();
    expect(res.status).toBe(504);
  });

  it("maps rate limits to 429", async () => {
    mockedFetch.mockRejectedValue(new BtcProviderRateLimitError());

    const res = await GET();
    expect(res.status).toBe(429);
  });

  it("maps malformed payloads to 502", async () => {
    mockedFetch.mockRejectedValue(
      new BtcProviderMalformedResponseError("bad candles"),
    );

    const res = await GET();
    expect(res.status).toBe(502);
  });

  it("maps upstream unavailable to 502", async () => {
    mockedFetch.mockRejectedValue(
      new BtcProviderUnavailableError(451, "region blocked"),
    );

    const res = await GET();
    expect(res.status).toBe(502);
  });

  it("maps network errors to 500", async () => {
    mockedFetch.mockRejectedValue(new BtcProviderNetworkError());

    const res = await GET();
    expect(res.status).toBe(500);
  });
});
