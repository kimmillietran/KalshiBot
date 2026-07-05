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
  it("finds the target ticker on the first list page with listMarketWire preserved", async () => {
    const importer = createImporter(async () => ({
      markets: [createMarketRecord()],
      cursor: "",
      provenance: {
        source: "kalshi-historical-api",
        fetchedAt: GENERATED_AT,
        requestPath: fixture.listEndpoint,
      },
    }));

    const result = await discoverSingleExpansionMarket(
      { marketTicker: fixture.ticker, seriesTicker: "KXBTC15M" },
      { importer, now: () => new Date(GENERATED_AT) },
    );

    expect(result?.pagesFetched).toBe(1);
    expect(result?.market.marketTicker).toBe(fixture.ticker);
    expect(result?.market.listMarketWire.expiration_value).toBe("94210.55");
    expect(importer.listHistoricalMarkets).toHaveBeenCalledTimes(1);
  });

  it("paginates until the target ticker is found", async () => {
    const importer = createImporter(async (_series, _range, pagination) => {
      if (!pagination?.cursor) {
        return {
          markets: [createMarketRecord({ ticker: "OTHER-TICKER" })],
          cursor: "page-2",
          provenance: {
            source: "kalshi-historical-api",
            fetchedAt: GENERATED_AT,
            requestPath: "/historical/markets?series_ticker=KXBTC15M&limit=100",
          },
        };
      }

      return {
        markets: [createMarketRecord()],
        cursor: "",
        provenance: {
          source: "kalshi-historical-api",
          fetchedAt: GENERATED_AT,
          requestPath:
            "/historical/markets?series_ticker=KXBTC15M&limit=100&cursor=page-2",
        },
      };
    });

    const result = await discoverSingleExpansionMarket(
      { marketTicker: fixture.ticker, seriesTicker: "KXBTC15M" },
      { importer, now: () => new Date(GENERATED_AT) },
    );

    expect(result?.pagesFetched).toBe(2);
    expect(result?.market.listMarketWire.expiration_value).toBe("94210.55");
    expect(importer.listHistoricalMarkets).toHaveBeenCalledTimes(2);
  });

  it("returns null when the ticker is absent from all list pages", async () => {
    const importer = createImporter(async () => ({
      markets: [createMarketRecord({ ticker: "OTHER-TICKER" })],
      cursor: "",
      provenance: {
        source: "kalshi-historical-api",
        fetchedAt: GENERATED_AT,
        requestPath: fixture.listEndpoint,
      },
    }));

    const result = await discoverSingleExpansionMarket(
      { marketTicker: fixture.ticker, seriesTicker: "KXBTC15M" },
      { importer, now: () => new Date(GENERATED_AT) },
    );

    expect(result).toBeNull();
  });
});
