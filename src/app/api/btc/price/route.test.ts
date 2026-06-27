import { afterEach, describe, expect, it, vi } from "vitest";

import {
  BtcProviderMalformedResponseError,
  BtcProviderNetworkError,
  BtcProviderRateLimitError,
  BtcProviderTimeoutError,
  BtcProviderUnavailableError,
  fetchBtcSpotPrice,
} from "@/features/btc-feed/api/btcServer";

import { GET } from "./route";

vi.mock("@/features/btc-feed/api/btcServer", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/btc-feed/api/btcServer")>();
  return {
    ...actual,
    fetchBtcSpotPrice: vi.fn(),
  };
});

const mockedFetch = vi.mocked(fetchBtcSpotPrice);

describe("GET /api/btc/price", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns normalized price on success", async () => {
    mockedFetch.mockResolvedValue({
      price: 64250.32,
      change24h: 250.32,
      change24hPercent: 0.39,
      updatedAt: "2026-06-26T12:00:00.000Z",
    });

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.price).toBe(64250.32);
  });

  it("maps timeouts to 504", async () => {
    mockedFetch.mockRejectedValue(new BtcProviderTimeoutError());

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(504);
    expect(body.error).toContain("timed out");
  });

  it("maps rate limits to 429", async () => {
    mockedFetch.mockRejectedValue(new BtcProviderRateLimitError());

    const res = await GET();
    expect(res.status).toBe(429);
  });

  it("maps malformed payloads to 502", async () => {
    mockedFetch.mockRejectedValue(new BtcProviderMalformedResponseError("bad stats"));

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(502);
    expect(body.error).toBe("bad stats");
  });

  it("maps upstream unavailable to 502", async () => {
    mockedFetch.mockRejectedValue(
      new BtcProviderUnavailableError(503, "Coinbase stats unavailable (503)"),
    );

    const res = await GET();
    expect(res.status).toBe(502);
  });

  it("maps network errors to 500", async () => {
    mockedFetch.mockRejectedValue(new BtcProviderNetworkError("ECONNRESET"));

    const res = await GET();
    expect(res.status).toBe(500);
  });
});
