import { describe, expect, it } from "vitest";

import type { DiscoveredMarket } from "./discoveryTypes";
import { MarketDiscoveryError } from "./discoveryTypes";
import { applyMarketSamplingFilters } from "./applyMarketSamplingFilters";

function market(
  ticker: string,
  closeTime: string,
): DiscoveredMarket {
  return {
    marketTicker: ticker,
    eventTicker: `${ticker}-event`,
    seriesTicker: "KXBTC15M",
    title: null,
    subtitle: null,
    status: "finalized",
    openTime: closeTime,
    closeTime,
    settlementTime: null,
    expirationValue: null,
    listMarketWire: {
      ticker,
      event_ticker: `${ticker}-event`,
      series_ticker: "KXBTC15M",
      status: "finalized",
      open_time: closeTime,
      close_time: closeTime,
    },
    provenance: {
      source: "kalshi-historical-api",
      fetchedAt: "2026-06-27T00:00:00.000Z",
      requestPath: "/historical/markets",
    },
  };
}

const MARKETS = [
  market("KXBTC15M-20260105-15", "2026-01-05T01:15:00.000Z"),
  market("KXBTC15M-20260115-15", "2026-01-15T01:15:00.000Z"),
  market("KXBTC15M-20260205-15", "2026-02-05T01:15:00.000Z"),
  market("KXBTC15M-20260215-15", "2026-02-15T01:15:00.000Z"),
];

describe("applyMarketSamplingFilters", () => {
  it("returns all markets when no sampling options are supplied", () => {
    const result = applyMarketSamplingFilters(MARKETS);

    expect(result.markets.map((entry) => entry.marketTicker)).toEqual([
      "KXBTC15M-20260105-15",
      "KXBTC15M-20260115-15",
      "KXBTC15M-20260205-15",
      "KXBTC15M-20260215-15",
    ]);
    expect(result.summary).toEqual({
      totalDiscovered: 4,
      afterDateFilter: 4,
      offset: 0,
      limit: null,
      finalMarketCount: 4,
    });
  });

  it("applies limit only", () => {
    const result = applyMarketSamplingFilters(MARKETS, { limit: 2 });

    expect(result.markets.map((entry) => entry.marketTicker)).toEqual([
      "KXBTC15M-20260105-15",
      "KXBTC15M-20260115-15",
    ]);
    expect(result.summary.finalMarketCount).toBe(2);
    expect(result.summary.limit).toBe(2);
  });

  it("applies offset only", () => {
    const result = applyMarketSamplingFilters(MARKETS, { offset: 2 });

    expect(result.markets.map((entry) => entry.marketTicker)).toEqual([
      "KXBTC15M-20260205-15",
      "KXBTC15M-20260215-15",
    ]);
    expect(result.summary.offset).toBe(2);
  });

  it("applies offset and limit together", () => {
    const result = applyMarketSamplingFilters(MARKETS, { offset: 1, limit: 2 });

    expect(result.markets.map((entry) => entry.marketTicker)).toEqual([
      "KXBTC15M-20260115-15",
      "KXBTC15M-20260205-15",
    ]);
  });

  it("applies after date filter", () => {
    const result = applyMarketSamplingFilters(MARKETS, { after: "2026-01-10" });

    expect(result.summary.afterDateFilter).toBe(3);
    expect(result.markets.map((entry) => entry.marketTicker)).toEqual([
      "KXBTC15M-20260115-15",
      "KXBTC15M-20260205-15",
      "KXBTC15M-20260215-15",
    ]);
  });

  it("applies before date filter", () => {
    const result = applyMarketSamplingFilters(MARKETS, { before: "2026-02-01" });

    expect(result.summary.afterDateFilter).toBe(2);
    expect(result.markets.map((entry) => entry.marketTicker)).toEqual([
      "KXBTC15M-20260105-15",
      "KXBTC15M-20260115-15",
    ]);
  });

  it("applies after and before together", () => {
    const result = applyMarketSamplingFilters(MARKETS, {
      after: "2026-01-01",
      before: "2026-02-01",
    });

    expect(result.summary.afterDateFilter).toBe(2);
    expect(result.markets.map((entry) => entry.marketTicker)).toEqual([
      "KXBTC15M-20260105-15",
      "KXBTC15M-20260115-15",
    ]);
  });

  it("handles limit zero deterministically", () => {
    const result = applyMarketSamplingFilters(MARKETS, { limit: 0 });

    expect(result.markets).toEqual([]);
    expect(result.summary.finalMarketCount).toBe(0);
  });

  it("rejects invalid dates", () => {
    expect(() =>
      applyMarketSamplingFilters(MARKETS, { after: "not-a-date" }),
    ).toThrow(MarketDiscoveryError);
  });

  it("rejects negative limit and offset", () => {
    expect(() => applyMarketSamplingFilters(MARKETS, { limit: -1 })).toThrow(
      MarketDiscoveryError,
    );
    expect(() => applyMarketSamplingFilters(MARKETS, { offset: -1 })).toThrow(
      MarketDiscoveryError,
    );
  });

  it("rejects after greater than before", () => {
    expect(() =>
      applyMarketSamplingFilters(MARKETS, {
        after: "2026-03-01",
        before: "2026-02-01",
      }),
    ).toThrow(MarketDiscoveryError);
  });

  it("preserves deterministic ordering across repeated runs", () => {
    const first = applyMarketSamplingFilters(MARKETS, {
      after: "2026-01-01",
      before: "2026-03-01",
      offset: 1,
      limit: 1,
    });
    const second = applyMarketSamplingFilters(MARKETS, {
      after: "2026-01-01",
      before: "2026-03-01",
      offset: 1,
      limit: 1,
    });

    expect(first).toEqual(second);
    expect(first.markets[0]?.marketTicker).toBe("KXBTC15M-20260115-15");
  });
});
