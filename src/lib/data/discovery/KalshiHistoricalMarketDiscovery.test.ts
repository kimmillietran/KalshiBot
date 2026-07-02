import { describe, expect, it, vi } from "vitest";

import type { HistoricalImporter } from "@/lib/data/importers/kalshi/HistoricalImporter";
import type { HistoricalMarketRecord } from "@/lib/data/importers/kalshi/kalshiHistoricalTypes";
import { KalshiHistoricalImporterError } from "@/lib/data/importers/kalshi/KalshiHistoricalImporter";

import {
  discoverKalshiHistoricalMarkets,
  serializeMarketDiscoveryResult,
} from "./KalshiHistoricalMarketDiscovery";
import { MarketDiscoveryError } from "./discoveryTypes";

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

  it("waits between paginated requests when request delay is configured", async () => {
    const sleep = vi.fn(async () => undefined);
    let callCount = 0;
    const importer = createImporter(async (_series, _range, pagination) => {
      callCount += 1;
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

    await discoverKalshiHistoricalMarkets(
      { seriesTicker: "KXBTC15M" },
      {
        importer,
        now: () => FIXED_NOW,
        rateLimit: { requestDelayMs: 500 },
        sleep,
      },
    );

    expect(callCount).toBe(2);
    expect(sleep).toHaveBeenCalledWith(500);
  });

  it("retries paginated discovery after a 429 response", async () => {
    const sleep = vi.fn(async () => undefined);
    const logRateLimitWarning = vi.fn();
    let callCount = 0;
    const importer = createImporter(async () => {
      callCount += 1;
      if (callCount === 1) {
        throw new KalshiHistoricalImporterError("rate limited", 429, undefined, 1200);
      }

      return {
        markets: [MARKET_B],
        cursor: "",
        provenance: {
          source: "kalshi-historical-api",
          fetchedAt: FIXED_NOW.toISOString(),
          requestPath: "/historical/markets?series_ticker=KXBTC15M&limit=100",
          cursor: "",
        },
      };
    });

    const result = await discoverKalshiHistoricalMarkets(
      { seriesTicker: "KXBTC15M" },
      {
        importer,
        now: () => FIXED_NOW,
        rateLimit: { maxRetries: 2 },
        sleep,
        logRateLimitWarning,
      },
    );

    expect(result.markets).toHaveLength(1);
    expect(callCount).toBe(2);
    expect(sleep).toHaveBeenCalledWith(1200);
    expect(logRateLimitWarning).toHaveBeenCalledWith(
      expect.stringContaining("retrying in 1200ms"),
    );
  });

  it("fails clearly when repeated 429 responses exhaust retries", async () => {
    const importer = createImporter(async () => {
      throw new KalshiHistoricalImporterError("rate limited", 429);
    });

    await expect(
      discoverKalshiHistoricalMarkets(
        { seriesTicker: "KXBTC15M" },
        {
          importer,
          now: () => FIXED_NOW,
          rateLimit: { maxRetries: 1 },
          sleep: async () => undefined,
        },
      ),
    ).rejects.toThrow(MarketDiscoveryError);
  });

  it("stops pagination early when limit is set without date filters", async () => {
    let pageFetches = 0;
    const importer = createImporter(async (_series, _range, pagination) => {
      pageFetches += 1;
      return {
        markets: Array.from({ length: 100 }, (_, index) => ({
          ...MARKET_A,
          ticker: `KXBTC15M-202601${String(index).padStart(2, "0")}-15`,
          eventTicker: `KXBTC15M-202601${String(index).padStart(2, "0")}`,
        })),
        cursor: pagination?.cursor ? "" : "page-2",
        provenance: {
          source: "kalshi-historical-api",
          fetchedAt: FIXED_NOW.toISOString(),
          requestPath: "/historical/markets?series_ticker=KXBTC15M&limit=100",
          cursor: pagination?.cursor ? "" : "page-2",
        },
      };
    });

    const result = await discoverKalshiHistoricalMarkets(
      {
        seriesTicker: "KXBTC15M",
        sampling: { limit: 50 },
      },
      { importer, now: () => FIXED_NOW },
    );

    expect(pageFetches).toBe(1);
    expect(result.metadata.progress).toEqual({
      earlyStopApplied: true,
      pagesFetched: 1,
      limitTarget: 50,
      totalDiscoveredMayBePartial: true,
    });
    expect(result.metadata.sampling).toMatchObject({
      limit: 50,
      finalMarketCount: 50,
      totalDiscovered: 100,
    });
    expect(result.markets).toHaveLength(50);
  });

  it("stops pagination after offset + limit markets are collected", async () => {
    let pageFetches = 0;
    const importer = createImporter(async (_series, _range, pagination) => {
      pageFetches += 1;
      return {
        markets: Array.from({ length: 100 }, (_, index) => ({
          ...MARKET_A,
          ticker: `KXBTC15M-202602${String(index).padStart(2, "0")}-15`,
          eventTicker: `KXBTC15M-202602${String(index).padStart(2, "0")}`,
        })),
        cursor: pagination?.cursor ? "" : "page-2",
        provenance: {
          source: "kalshi-historical-api",
          fetchedAt: FIXED_NOW.toISOString(),
          requestPath: "/historical/markets?series_ticker=KXBTC15M&limit=100",
          cursor: pagination?.cursor ? "" : "page-2",
        },
      };
    });

    const result = await discoverKalshiHistoricalMarkets(
      {
        seriesTicker: "KXBTC15M",
        sampling: { offset: 100, limit: 50 },
      },
      { importer, now: () => FIXED_NOW },
    );

    expect(pageFetches).toBe(2);
    expect(result.metadata.progress).toMatchObject({
      earlyStopApplied: true,
      pagesFetched: 2,
      limitTarget: 150,
    });
    expect(result.markets).toHaveLength(50);
  });

  it("does not early stop when date filters require a full catalog scan", async () => {
    let pageFetches = 0;
    const importer = createImporter(async (_series, _range, pagination) => {
      pageFetches += 1;
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
      {
        seriesTicker: "KXBTC15M",
        sampling: {
          after: "2026-06-27T01:30:00Z",
          limit: 1,
        },
      },
      { importer, now: () => FIXED_NOW },
    );

    expect(pageFetches).toBe(2);
    expect(result.metadata.progress).toEqual({
      earlyStopApplied: false,
      pagesFetched: 2,
      limitTarget: 1,
      totalDiscoveredMayBePartial: false,
    });
  });

  it("emits progress logs while paginating", async () => {
    const logDiscoveryProgress = vi.fn();
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

    await discoverKalshiHistoricalMarkets(
      {
        seriesTicker: "KXBTC15M",
        sampling: { limit: 1 },
      },
      {
        importer,
        now: () => FIXED_NOW,
        logDiscoveryProgress,
      },
    );

    expect(logDiscoveryProgress).toHaveBeenCalledWith(
      "[discover] page=1 collected=1 limitTarget=1",
    );
    expect(logDiscoveryProgress).toHaveBeenCalledWith(
      "[discover] early stop: collected 1 >= target 1",
    );
  });

  it("skips pagination when limit is zero", async () => {
    const importer = createImporter(async () => {
      throw new Error("should not fetch pages when limit is zero");
    });

    const result = await discoverKalshiHistoricalMarkets(
      {
        seriesTicker: "KXBTC15M",
        sampling: { limit: 0 },
      },
      { importer, now: () => FIXED_NOW },
    );

    expect(result.markets).toHaveLength(0);
    expect(result.metadata.progress).toMatchObject({
      earlyStopApplied: true,
      pagesFetched: 0,
      limitTarget: 0,
    });
  });
});
