import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { MarketDataProvider } from "../MarketDataProvider";
import { useActiveBtcMarket } from "./useActiveBtcMarket";

const liveMarket = {
  ticker: "KXBTC15M-26JUN261930-30",
  title: "BTC price up in next 15 mins?",
  targetPrice: 59990.31,
  status: "active",
  openTime: "2026-06-26T23:15:00Z",
  closeTime: "2026-06-26T23:30:00Z",
  timeRemainingMs: 600_000,
  updatedAt: "2026-06-26T23:20:00.000Z",
  source: "kalshi" as const,
  isFallback: false,
};

function wrapper({ children }: { children: ReactNode }) {
  return <MarketDataProvider>{children}</MarketDataProvider>;
}

describe("useActiveBtcMarket", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("starts in loading state", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise(() => {})),
    );

    const { result } = renderHook(() => useActiveBtcMarket(), { wrapper });
    expect(result.current.isLoading).toBe(true);
  });

  it("exposes live market data after a successful fetch", async () => {
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
