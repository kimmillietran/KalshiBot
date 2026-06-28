import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { QueryTestProvider } from "@/test/query-test-utils";

import { COUNTDOWN_TICK_MS } from "../constants";
import {
  FALLBACK_CONTRACT_PRICING,
  FALLBACK_MARKET_TICKER,
  FALLBACK_TARGET_PRICE,
} from "../fallback";
import { MarketDataProvider } from "../MarketDataProvider";
import { MarketLifecycle } from "../types";
import { useActiveBtcMarket } from "./useActiveBtcMarket";

const mockOrderbookFeed = vi.hoisted(() =>
  vi.fn(() => ({
    ticker: null,
    status: "idle" as const,
    pricing: null,
    topOfBook: null,
    lastSeq: null,
    lastUpdateAt: null,
    errorMessage: null,
  })),
);

vi.mock("./useOrderbookFeed", () => ({
  useOrderbookFeed: mockOrderbookFeed,
}));

const liveMarket = {
  ticker: "KXBTC15M-26JUN261930-30",
  title: "BTC price up in next 15 mins?",
  targetPrice: 59990.31,
  lifecycle: MarketLifecycle.ACTIVE,
  openTime: "2026-06-26T23:15:00Z",
  closeTime: "2026-06-26T23:30:00Z",
  timeRemainingMs: 600_000,
  updatedAt: "2026-06-26T23:20:00.000Z",
  source: "kalshi" as const,
  isFallback: false,
};

const livePricing = {
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

function wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryTestProvider>
      <MarketDataProvider>{children}</MarketDataProvider>
    </QueryTestProvider>
  );
}

describe("MarketDataProvider", () => {
  beforeEach(() => {
    mockOrderbookFeed.mockReturnValue({
      ticker: null,
      status: "idle",
      pricing: null,
      topOfBook: null,
      lastSeq: null,
      lastUpdateAt: null,
      errorMessage: null,
    });
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date("2026-06-26T23:20:00Z"));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("enters fallback state when the BFF returns 504", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: false,
          status: 504,
          statusText: "Gateway Timeout",
          text: async () => "Kalshi request timed out",
        } as Response),
      ),
    );

    const { result } = renderHook(() => useActiveBtcMarket(), { wrapper });

    await waitFor(() => {
      expect(result.current.feedStatus).toBe("fallback");
    });

    expect(result.current.isFallback).toBe(true);
    expect(result.current.lifecycle).toBeUndefined();
    expect(result.current.targetPrice).toBe(FALLBACK_TARGET_PRICE);
    expect(result.current.ticker).toBe(FALLBACK_MARKET_TICKER);
    expect(result.current.pricing?.isFallback).toBe(true);
    expect(result.current.contractOdds?.up.price).toBe(63);
  });

  it("enters no-market state when discovery is empty", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: async () => ({
            market: null,
            pricing: null,
            noMarket: true,
            message: "No active BTC 15m market",
          }),
        } as Response),
      ),
    );

    const { result } = renderHook(() => useActiveBtcMarket(), { wrapper });

    await waitFor(() => {
      expect(result.current.feedStatus).toBe("no-market");
    });

    expect(result.current.noMarket).toBe(true);
    expect(result.current.title).toBe("No Active Market");
    expect(result.current.lifecycle).toBeUndefined();
    expect(result.current.pricing).toBeNull();
    expect(result.current.contractOdds).toBeNull();
  });

  it("refreshes market data when countdown expires", async () => {
    const closeTime = "2026-06-26T23:30:00Z";
    const nextMarket = {
      ...liveMarket,
      ticker: "KXBTC15M-NEXT",
      closeTime: "2026-06-26T23:45:00Z",
    };

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          market: { ...liveMarket, closeTime },
          pricing: livePricing,
          noMarket: false,
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          market: nextMarket,
          pricing: livePricing,
          noMarket: false,
        }),
      } as Response);

    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useActiveBtcMarket(), { wrapper });

    await waitFor(() => {
      expect(result.current.feedStatus).toBe("live");
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);

    vi.setSystemTime(new Date("2026-06-26T23:30:01Z"));
    await vi.advanceTimersByTimeAsync(COUNTDOWN_TICK_MS);

    await waitFor(() => {
      expect(fetchMock.mock.calls.length).toBeGreaterThan(1);
    });

    await waitFor(() => {
      expect(result.current.ticker).toBe(nextMarket.ticker);
    });
  });

  it("prefers live orderbook pricing over polled REST pricing", async () => {
    const orderbookPricing = {
      ...livePricing,
      yes: {
        bidCents: 55,
        askCents: 56,
        midCents: 56,
        lastCents: null,
        spreadCents: 1,
      },
      source: "kalshi" as const,
    };

    mockOrderbookFeed.mockReturnValue({
      ticker: liveMarket.ticker,
      status: "live",
      pricing: orderbookPricing,
      topOfBook: null,
      lastSeq: 1,
      lastUpdateAt: "2026-06-26T23:20:01.000Z",
      errorMessage: null,
    });

    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: async () => ({
            market: liveMarket,
            pricing: livePricing,
            noMarket: false,
          }),
        } as Response),
      ),
    );

    const { result } = renderHook(() => useActiveBtcMarket(), { wrapper });

    await waitFor(() => {
      expect(result.current.feedStatus).toBe("live");
    });

    expect(result.current.pricing?.yes.bidCents).toBe(55);
    expect(result.current.contractOdds?.up.price).toBe(56);
  });
});

describe("useActiveBtcMarket", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("starts in loading state", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise(() => {})),
    );

    const { result } = renderHook(() => useActiveBtcMarket(), { wrapper });
    expect(result.current.isLoading).toBe(true);
  });

  it("exposes lifecycle and contract pricing after a successful fetch", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: async () => ({
            market: liveMarket,
            pricing: livePricing,
            noMarket: false,
          }),
        } as Response),
      ),
    );

    const { result } = renderHook(() => useActiveBtcMarket(), { wrapper });

    await waitFor(() => {
      expect(result.current.feedStatus).toBe("live");
    });

    expect(result.current.lifecycle).toBe(MarketLifecycle.ACTIVE);
    expect(result.current.ticker).toBe(liveMarket.ticker);
    expect(result.current.targetPrice).toBe(59990.31);
    expect(result.current.pricing?.yes.midCents).toBe(16);
    expect(result.current.contractOdds?.up.price).toBe(16);
    expect(result.current.pricingIsStale).toBe(false);
  });

  it("enters fallback state when the BFF fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: false,
          status: 502,
          statusText: "Bad Gateway",
          text: async () => "upstream error",
        } as Response),
      ),
    );

    const { result } = renderHook(() => useActiveBtcMarket(), { wrapper });

    await waitFor(() => {
      expect(result.current.feedStatus).toBe("fallback");
    });

    expect(result.current.isFallback).toBe(true);
    expect(result.current.pricing).toEqual(FALLBACK_CONTRACT_PRICING);
  });
});
