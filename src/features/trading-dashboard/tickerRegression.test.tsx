import { screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TradingDashboard } from "@/features/trading-dashboard";
import { CommandBar } from "@/features/trading-dashboard/components/CommandBar";
import { liveMarket } from "@/test/test-utils";
import { renderWithDashboard } from "@/test/test-utils";

import { findRawTickerLeaksInContainer } from "./tickerVisibility";

describe("raw ticker UI regression", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  async function expectNoRawTickerLeaks(container: HTMLElement) {
    await waitFor(() => {
      expect(screen.getAllByText(/\$59,990\.31/).length).toBeGreaterThan(0);
    });

    expect(screen.getByText(/BTC 15m · Live Kalshi contract/i)).toBeInTheDocument();
    expect(screen.queryByText(liveMarket.ticker)).not.toBeInTheDocument();
    expect(findRawTickerLeaksInContainer(container)).toEqual([]);
  }

  it("CommandBar after simulated hard refresh (cold load → live market)", async () => {
    const { container } = renderWithDashboard(<CommandBar />);
    await expectNoRawTickerLeaks(container);
  });

  it("full dashboard after live feeds resolve", async () => {
    const { container } = renderWithDashboard(<TradingDashboard />);
    await expectNoRawTickerLeaks(container);
  });

  it("fallback mode does not show raw ticker", async () => {
    const { container } = renderWithDashboard(<CommandBar />, { kalshiFails: true });

    await waitFor(() => {
      expect(screen.getAllByText(/FALLBACK/i).length).toBeGreaterThan(0);
    });

    expect(findRawTickerLeaksInContainer(container)).toEqual([]);
  });

  it("no active market does not show raw ticker", async () => {
    const { container } = renderWithDashboard(<CommandBar />, { noMarket: true });

    await waitFor(() => {
      expect(screen.getByText(/No active Kalshi BTC contract/i)).toBeInTheDocument();
    });

    expect(findRawTickerLeaksInContainer(container)).toEqual([]);
  });

  it("market rollover refetch keeps readable contract copy", async () => {
    const nextTicker = "KXBTC15M-26JUN270200-00";
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);

      if (url.includes("/api/btc/price")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            price: 64250.32,
            change24h: 1134.5,
            change24hPercent: 1.8,
            updatedAt: new Date().toISOString(),
          }),
        } as Response);
      }

      if (url.includes("/api/btc/candles")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ candles: [] }),
        } as Response);
      }

      if (url.includes("/api/kalshi/markets/active")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            market: { ...liveMarket, ticker: nextTicker },
            pricing: {
              yes: { bidCents: 15, askCents: 16, midCents: 16, lastCents: 16, spreadCents: 1 },
              no: { bidCents: 84, askCents: 85, midCents: 85, lastCents: null, spreadCents: 1 },
              volumeLabel: "$503K",
              liquidityQuality: "Good",
              updatedAt: new Date().toISOString(),
              isFallback: false,
              source: "kalshi",
            },
            noMarket: false,
          }),
        } as Response);
      }

      return Promise.reject(new Error(`Unhandled fetch: ${url}`));
    });

    vi.stubGlobal("fetch", fetchMock);

    const { container } = renderWithDashboard(<CommandBar />);
    await expectNoRawTickerLeaks(container);
    expect(screen.queryByText(nextTicker)).not.toBeInTheDocument();
  });
});
