import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { QueryTestProvider } from "@/test/query-test-utils";

import { COUNTDOWN_TICK_MS } from "../constants";
import { FALLBACK_MARKET_TICKER, FALLBACK_TARGET_PRICE } from "../fallback";
import { MarketDataProvider } from "../MarketDataProvider";
import { MarketLifecycle } from "../types";
import { useActiveBtcMarket } from "./useActiveBtcMarket";

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

function wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryTestProvider>
      <MarketDataProvider>{children}</MarketDataProvider>
    </QueryTestProvider>
  );
}

describe("MarketDataProvider", () => {
  beforeEach(() => {
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
  });

  it("enters no-market state when discovery is empty", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: async () => ({
            market: null,
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
        json: async () => ({ market: { ...liveMarket, closeTime }, noMarket: false }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ market: nextMarket, noMarket: false }),
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
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    await waitFor(() => {
      expect(result.current.ticker).toBe(nextMarket.ticker);
    });
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

  it("exposes lifecycle after a successful fetch", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: async () => ({ market: liveMarket, noMarket: false }),
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
    expect(result.current.targetPrice).toBeGreaterThan(0);
  });
});
