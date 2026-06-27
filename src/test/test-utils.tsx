import type { ReactElement } from "react";

import { render } from "@testing-library/react";
import { vi } from "vitest";

import { BtcFeedProvider } from "@/features/btc-feed";
import {
  MarketDataProvider,
  useActiveBtcMarket,
} from "@/features/market-data";
import { MarketLifecycle } from "@/features/market-data/types";
import { QueryTestProvider } from "@/test/query-test-utils";

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

function BtcFeedWithMarketTarget({ children }: { children: React.ReactNode }) {
  const { targetPrice } = useActiveBtcMarket();
  return <BtcFeedProvider targetPrice={targetPrice}>{children}</BtcFeedProvider>;
}

/** Mock BTC + Kalshi BFF responses for dashboard component tests. */
export function mockDashboardApiFetch(options?: {
  kalshiFails?: boolean;
  noMarket?: boolean;
}) {
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
        json: async () => ({
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
        }),
      } as Response);
    }

    if (url.includes("/api/kalshi/markets/active")) {
      if (options?.kalshiFails) {
        return Promise.resolve({
          ok: false,
          status: 502,
          statusText: "Bad Gateway",
          text: async () => "upstream error",
        } as Response);
      }

      if (options?.noMarket) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            market: null,
            noMarket: true,
            message: "No active BTC 15m market",
          }),
        } as Response);
      }

      return Promise.resolve({
        ok: true,
        json: async () => ({
          market: liveMarket,
          noMarket: false,
        }),
      } as Response);
    }

    return Promise.reject(new Error(`Unhandled fetch: ${url}`));
  });

  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

export function renderWithDashboard(
  ui: ReactElement,
  options?: {
    kalshiFails?: boolean;
    noMarket?: boolean;
  },
) {
  mockDashboardApiFetch(options);
  return render(
    <QueryTestProvider>
      <MarketDataProvider>
        <BtcFeedWithMarketTarget>{ui}</BtcFeedWithMarketTarget>
      </MarketDataProvider>
    </QueryTestProvider>,
  );
}

/** @deprecated Use renderWithDashboard — kept for btc-only tests during migration. */
export function renderWithBtcFeed(ui: ReactElement) {
  return renderWithDashboard(ui);
}

export { liveMarket };
