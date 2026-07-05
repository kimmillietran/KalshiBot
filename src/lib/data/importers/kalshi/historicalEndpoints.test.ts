import { describe, expect, it } from "vitest";

import {
  buildHistoricalCandlesticksPath,
  buildHistoricalCutoffPath,
  buildHistoricalMarketPath,
  buildHistoricalMarketsPath,
  buildHistoricalTradesPath,
  DEFAULT_KALSHI_HISTORICAL_API_BASE,
} from "./historicalEndpoints";

describe("historicalEndpoints", () => {
  it("builds historical markets path with series ticker and pagination", () => {
    expect(
      buildHistoricalMarketsPath("KXBTC15M", undefined, {
        limit: 50,
        cursor: "abc123",
      }),
    ).toBe("/historical/markets?series_ticker=KXBTC15M&limit=50&cursor=abc123");
  });

  it("builds historical markets path with tickers filter instead of series ticker", () => {
    expect(
      buildHistoricalMarketsPath("KXBTC15M", undefined, {
        tickers: "KXBTC15M-25DEC311900-00",
        limit: 1,
      }),
    ).toBe("/historical/markets?tickers=KXBTC15M-25DEC311900-00&limit=1");
  });

  it("builds candlesticks path with interval and date range", () => {
    expect(
      buildHistoricalCandlesticksPath("KXBTC-OLD", 60, {
        startTs: 1_700_000_000,
        endTs: 1_700_086_400,
      }),
    ).toBe(
      "/historical/markets/KXBTC-OLD/candlesticks?period_interval=60&start_ts=1700000000&end_ts=1700086400",
    );
  });

  it("builds trades path with ticker and date range", () => {
    expect(
      buildHistoricalTradesPath(
        { ticker: "KXBTC-OLD" },
        { startTs: 1_700_000_000, endTs: 1_700_010_000 },
        { limit: 25 },
      ),
    ).toBe(
      "/historical/trades?ticker=KXBTC-OLD&min_ts=1700000000&max_ts=1700010000&limit=25",
    );
  });

  it("builds cutoff and market paths deterministically", () => {
    expect(buildHistoricalCutoffPath()).toBe("/historical/cutoff");
    expect(buildHistoricalMarketPath("KXBTC-SETTLED")).toBe(
      "/historical/markets/KXBTC-SETTLED",
    );
    expect(DEFAULT_KALSHI_HISTORICAL_API_BASE).toContain("/trade-api/v2");
  });

  it("URL-encodes tickers with reserved characters", () => {
    expect(buildHistoricalMarketPath("KX/BTC+15")).toBe(
      "/historical/markets/KX%2FBTC%2B15",
    );
    expect(
      buildHistoricalCandlesticksPath("KX/BTC+15", 1, {
        startTs: 1,
        endTs: 2,
      }),
    ).toBe(
      "/historical/markets/KX%2FBTC%2B15/candlesticks?period_interval=1&start_ts=1&end_ts=2",
    );
  });

  it("throws when candlesticks date range is incomplete", () => {
    expect(() =>
      buildHistoricalCandlesticksPath("KXBTC-OLD", 1, {}),
    ).toThrow(/require dateRange.startTs and dateRange.endTs/i);

    expect(() =>
      buildHistoricalCandlesticksPath("KXBTC-OLD", 1, { startTs: 100 }),
    ).toThrow(/require dateRange.startTs and dateRange.endTs/i);
  });

  it("defers markets dateRange query params until API support is confirmed", () => {
    expect(
      buildHistoricalMarketsPath("KXBTC15M", { startTs: 1, endTs: 2 }),
    ).toBe("/historical/markets?series_ticker=KXBTC15M");
  });
});
