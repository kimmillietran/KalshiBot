import { describe, expect, it, vi } from "vitest";

import fixture from "@/lib/data/importers/kalshi/fixtures/KXBTC15M-25DEC311900-00-market-responses.json";
import type { HistoricalImporter } from "@/lib/data/importers/kalshi/HistoricalImporter";
import type { HistoricalMarketRecord } from "@/lib/data/importers/kalshi/kalshiHistoricalTypes";

import { discoverSingleExpansionMarket } from "./discoverSingleExpansionMarket";

const GENERATED_AT = "2026-07-04T04:00:00.000Z";

function createMarketRecord(
  overrides: Partial<HistoricalMarketRecord> = {},
): HistoricalMarketRecord {
  return {
    ticker: fixture.ticker,
    eventTicker: "KXBTC15M-25DEC311900",
    status: "finalized",
    result: "yes",
    openTime: fixture.listMarket.open_time!,
    closeTime: fixture.listMarket.close_time!,
    settlementTs: fixture.listMarket.settlement_ts ?? null,
    settlementValueDollars: fixture.listMarket.settlement_value_dollars ?? null,
    expirationValue: fixture.listMarket.expiration_value!,
    floorStrike: fixture.listMarket.floor_strike ?? null,
    title: null,
    subtitle: null,
    seriesTicker: "KXBTC15M",
    ...overrides,
  };
}

function createListPage(
  markets: HistoricalMarketRecord[],
  options?: { cursor?: string; requestPath?: string },
) {
  return {
    markets,
    rawMarketWires: markets.map((market) =>
      market.ticker === fixture.ticker
        ? fixture.listMarket
        : { ticker: market.ticker, expiration_value: market.expirationValue },
    ),
    cursor: options?.cursor ?? "",
    provenance: {
      source: "kalshi-historical-api" as const,
      fetchedAt: GENERATED_AT,
      requestPath: options?.requestPath ?? fixture.listEndpoint,
    },
  };
}

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

describe("discoverSingleExpansionMarket", () => {
  it("finds the target ticker via tickers filter with listMarketWire preserved", async () => {
    const importer = createImporter(async (_series, _range, pagination) => {
      expect(pagination?.tickers).toBe(fixture.ticker);
      return createListPage([createMarketRecord()], {
        requestPath: `/historical/markets?tickers=${fixture.ticker}&limit=100`,
      });
    });

    const result = await discoverSingleExpansionMarket(
      { marketTicker: fixture.ticker, seriesTicker: "KXBTC15M" },
      { importer, now: () => new Date(GENERATED_AT) },
    );

    expect(result?.pagesFetched).toBe(1);
    expect(result?.foundOnPage).toBe(1);
    expect(result?.market.marketTicker).toBe(fixture.ticker);
    expect(result?.market.listMarketWire.expiration_value).toBe("94210.55");
    expect(result?.rawMarketRecord.expirationValue).toBe("94210.55");
    expect(importer.listHistoricalMarkets).toHaveBeenCalledTimes(1);
  });

  it("falls back to pagination when tickers filter misses", async () => {
    const importer = createImporter(async (_series, _range, pagination) => {
      if (pagination?.tickers) {
        return createListPage([], {
          requestPath: `/historical/markets?tickers=${fixture.ticker}&limit=100`,
        });
      }

      if (!pagination?.cursor) {
        return createListPage([createMarketRecord({ ticker: "OTHER-TICKER" })], {
          cursor: "page-2",
          requestPath: "/historical/markets?series_ticker=KXBTC15M&limit=100",
        });
      }

      return createListPage([createMarketRecord()], {
        requestPath:
          "/historical/markets?series_ticker=KXBTC15M&limit=100&cursor=page-2",
      });
    });

    const result = await discoverSingleExpansionMarket(
      { marketTicker: fixture.ticker, seriesTicker: "KXBTC15M" },
      { importer, now: () => new Date(GENERATED_AT) },
    );

    expect(result?.pagesFetched).toBe(2);
    expect(result?.foundOnPage).toBe(2);
    expect(result?.market.listMarketWire.expiration_value).toBe("94210.55");
    expect(importer.listHistoricalMarkets).toHaveBeenCalledTimes(3);
  });

  it("returns null when the ticker is absent from tickers filter and pagination", async () => {
    const importer = createImporter(async (_series, _range, pagination) =>
      createListPage([createMarketRecord({ ticker: "OTHER-TICKER" })], {
        requestPath: pagination?.tickers
          ? `/historical/markets?tickers=${fixture.ticker}&limit=100`
          : fixture.listEndpoint,
      }),
    );

    const result = await discoverSingleExpansionMarket(
      { marketTicker: fixture.ticker, seriesTicker: "KXBTC15M" },
      { importer, now: () => new Date(GENERATED_AT) },
    );

    expect(result).toBeNull();
  });
});
