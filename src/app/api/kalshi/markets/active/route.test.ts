import { afterEach, describe, expect, it, vi } from "vitest";

import { MarketLifecycle } from "@/features/market-data/types";
import { KalshiRequestTimeoutError } from "@/features/market-data/api/fetchWithTimeout";

import { GET } from "./route";

const samplePricing = {
  yes: {
    bidCents: 15,
    askCents: 16,
    midCents: 16,
    lastCents: 16,
    spreadCents: 1,
  },
  no: {
    bidCents: 84,
    askCents: 85,
    midCents: 85,
    lastCents: null,
    spreadCents: 1,
  },
  volumeLabel: "$503K",
  liquidityQuality: "Good" as const,
  updatedAt: "2026-06-26T23:20:00.000Z",
  isFallback: false,
  source: "kalshi" as const,
};

vi.mock("@/features/market-data/api/kalshiServer", () => ({
  discoverActiveBtcMarket: vi.fn(),
}));

import { discoverActiveBtcMarket } from "@/features/market-data/api/kalshiServer";

const mockedDiscover = vi.mocked(discoverActiveBtcMarket);

describe("GET /api/kalshi/markets/active", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns normalized market on success", async () => {
    mockedDiscover.mockResolvedValue({
      kind: "market",
      market: {
        ticker: "KXBTC15M-26JUN261930-30",
        title: "BTC price up in next 15 mins?",
        targetPrice: 59990.31,
        lifecycle: MarketLifecycle.ACTIVE,
        openTime: "2026-06-26T23:15:00Z",
        closeTime: "2026-06-26T23:30:00Z",
        timeRemainingMs: 600_000,
        updatedAt: "2026-06-26T23:20:00.000Z",
        source: "kalshi",
        isFallback: false,
      },
      pricing: samplePricing,
    });

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.noMarket).toBe(false);
    expect(body.market.ticker).toBe("KXBTC15M-26JUN261930-30");
    expect(body.pricing.yes.midCents).toBe(16);
  });

  it("returns no-market response when discovery is empty", async () => {
    mockedDiscover.mockResolvedValue({
      kind: "no-market",
      message: "No active BTC 15m market",
    });

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({
      market: null,
      pricing: null,
      noMarket: true,
      message: "No active BTC 15m market",
    });
  });

  it("maps upstream failures to 502", async () => {
    mockedDiscover.mockRejectedValue(new Error("Kalshi markets open unavailable (500)"));

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(502);
    expect(body.error).toContain("unavailable");
  });

  it("maps rate limits to 429", async () => {
    mockedDiscover.mockRejectedValue(new Error("Kalshi rate limit exceeded"));

    const res = await GET();
    expect(res.status).toBe(429);
  });

  it("maps upstream timeouts to 504", async () => {
    mockedDiscover.mockRejectedValue(new KalshiRequestTimeoutError());

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(504);
    expect(body.error).toContain("timed out");
  });
});
