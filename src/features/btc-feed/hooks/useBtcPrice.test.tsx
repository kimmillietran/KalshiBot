import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { BtcFeedProvider } from "../BtcFeedProvider";
import { QueryTestProvider } from "@/test/query-test-utils";
import { useBtcChartData } from "./useBtcChartData";
import { useBtcPrice } from "./useBtcPrice";

function wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryTestProvider>
      <BtcFeedProvider>{children}</BtcFeedProvider>
    </QueryTestProvider>
  );
}

const priceResponse = {
  price: 64250.32,
  change24h: 1134.5,
  change24hPercent: 1.8,
  updatedAt: new Date().toISOString(),
};

const candlesResponse = {
  candles: [
    {
      timestamp: Date.now() - 60_000,
      time: "12:29",
      open: 64180,
      high: 64200,
      low: 64170,
      close: 64190,
    },
    {
      timestamp: Date.now(),
      time: "12:30",
      open: 64190,
      high: 64260,
      low: 64190,
      close: 64250.32,
    },
  ],
};

function mockBtcFetch() {
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/btc/price")) {
        return Promise.resolve({
          ok: true,
          json: async () => priceResponse,
        } as Response);
      }
      if (url.includes("/api/btc/candles")) {
        return Promise.resolve({
          ok: true,
          json: async () => candlesResponse,
        } as Response);
      }
      return Promise.reject(new Error(`Unhandled fetch: ${url}`));
    }),
  );
}

describe("useBtcPrice", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("starts in loading state", () => {
    mockBtcFetch();
    const { result } = renderHook(() => useBtcPrice(), { wrapper });
    expect(result.current.status).toBe("loading");
  });

  it("exposes live price after a successful fetch", async () => {
    mockBtcFetch();
    const { result } = renderHook(() => useBtcPrice(), { wrapper });

    await waitFor(() => {
      expect(result.current.status).toBe("live");
    });

    expect(result.current.price).toBe(priceResponse.price);
    expect(result.current.change24hPercent).toBe(priceResponse.change24hPercent);
    expect(result.current.isUsingFallback).toBe(false);
  });

  it("enters fallback when the BFF fails", async () => {
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

    const { result } = renderHook(() => useBtcPrice(), { wrapper });

    await waitFor(() => {
      expect(result.current.status).toBe("fallback");
    });

    expect(result.current.isUsingFallback).toBe(true);
    expect(result.current.errorMessage).toContain("502");
  });
});

describe("useBtcChartData", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("returns chart points after candles load", async () => {
    mockBtcFetch();
    const { result } = renderHook(() => useBtcChartData(), { wrapper });

    await waitFor(() => {
      expect(result.current.points.length).toBeGreaterThan(0);
    });

    expect(result.current.currentPrice).toBe(priceResponse.price);
    expect(result.current.isLoading).toBe(false);
  });
});
