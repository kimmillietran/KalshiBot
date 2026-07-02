import { describe, expect, it, vi } from "vitest";

import type { HistoricalImporter } from "@/lib/data/importers/kalshi/HistoricalImporter";
import type { HistoricalMarketRecord } from "@/lib/data/importers/kalshi/kalshiHistoricalTypes";

import {
  discoverKalshiHistoricalMarkets,
  serializeMarketDiscoveryResult,
} from "./KalshiHistoricalMarketDiscovery";

const FIXED_NOW = new Date("2026-06-27T12:00:00.000Z");

const MARKET_A: HistoricalMarketRecord = {
  ticker: "KXBTC15M-26JUN270200-15",
  eventTicker: "KXBTC15M-26JUN270200",
  status: "finalized",
  result: "yes",
  openTime: "2026-06-27T02:00:00Z",
  closeTime: "2026-06-27T02:15:00Z",
  settlementTs: "2026-06-27T02:20:00Z",
  settlementValueDollars: "1.0000",
  expirationValue: "60010.25",
  floorStrike: 59_990.31,
  title: "BTC up?",
  subtitle: "Above strike",
  seriesTicker: "KXBTC15M",
};

const MARKET_B: HistoricalMarketRecord = {
  ...MARKET_A,
  ticker: "KXBTC15M-26JUN270115-15",
  eventTicker: "KXBTC15M-26JUN270115",
  openTime: "2026-06-27T01:00:00Z",
  closeTime: "2026-06-27T01:15:00Z",
};

function createImporter(
  handler: HistoricalImporter["listHistoricalMarkets"],
): HistoricalImporter {
  return {
    listHistoricalMarkets: vi.fn(handler),
    getMarketCandlesticks: vi.fn(),
    getHistoricalTrades: vi.fn(),
    getHistoricalCutoff: vi.fn(),
    getHistoricalMarket: vi.fn(),
    getSettlementResult: vi.fn(),
  };
}

describe("discoverKalshiHistoricalMarkets", () => {
  it("paginates historical markets and returns deterministic sorted output", async () => {
    const importer = createImporter(async (_series, _range, pagination) => {
      if (!pagination?.cursor) {
        return {
          markets: [MARKET_A],
          cursor: "page-2",
          provenance: {
            source: "kalshi-historical-api",
            fetchedAt: FIXED_NOW.toISOString(),
            requestPath: "/historical/markets?series_ticker=KXBTC15M&limit=100",
            cursor: "page-2",
          },
        };
      }

      return {
        markets: [MARKET_B],
        cursor: "",
        provenance: {
          source: "kalshi-historical-api",
          fetchedAt: FIXED_NOW.toISOString(),
          requestPath:
            "/historical/markets?series_ticker=KXBTC15M&limit=100&cursor=page-2",
          cursor: "",
        },
      };
    });

    const result = await discoverKalshiHistoricalMarkets(
      { seriesTicker: "KXBTC15M" },
      { importer, now: () => FIXED_NOW },
    );

    expect(result.metadata).toEqual({
      seriesTicker: "KXBTC15M",
      discoveredAt: FIXED_NOW.toISOString(),
      marketCount: 2,
      pageCount: 2,
    });
    expect(result.markets.map((market) => market.marketTicker)).toEqual([
      "KXBTC15M-26JUN270115-15",
      "KXBTC15M-26JUN270200-15",
    ]);
    expect(result.validation.valid).toBe(true);
    expect(result.provenance.pages).toHaveLength(2);
  });

  it("serializes discovery output deterministically", async () => {
    const importer = createImporter(async () => ({
      markets: [MARKET_B],
      cursor: "",
      provenance: {
        source: "kalshi-historical-api",
        fetchedAt: FIXED_NOW.toISOString(),
        requestPath: "/historical/markets?series_ticker=KXBTC15M&limit=100",
        cursor: "",
      },
    }));

    const result = await discoverKalshiHistoricalMarkets(
      { seriesTicker: "KXBTC15M" },
      { importer, now: () => FIXED_NOW },
    );

    const first = serializeMarketDiscoveryResult(result);
    const second = serializeMarketDiscoveryResult(result);

    expect(first).toBe(second);
    expect(first).toContain("KXBTC15M-26JUN270115-15");
  });

  it("applies sampling filters after deterministic sort", async () => {
    const importer = createImporter(async () => ({
      markets: [MARKET_A, MARKET_B],
      cursor: "",
      provenance: {
        source: "kalshi-historical-api",
        fetchedAt: FIXED_NOW.toISOString(),
        requestPath: "/historical/markets?series_ticker=KXBTC15M&limit=100",
        cursor: "",
      },
    }));

    const result = await discoverKalshiHistoricalMarkets(
      {
        seriesTicker: "KXBTC15M",
        sampling: {
          after: "2026-06-27T01:30:00Z",
          limit: 1,
        },
      },
      { importer, now: () => FIXED_NOW },
    );

    expect(result.metadata.sampling).toEqual({
      totalDiscovered: 2,
      afterDateFilter: 1,
      offset: 0,
      limit: 1,
      finalMarketCount: 1,
    });
    expect(result.markets.map((market) => market.marketTicker)).toEqual([
      "KXBTC15M-26JUN270200-15",
    ]);
  });
});
