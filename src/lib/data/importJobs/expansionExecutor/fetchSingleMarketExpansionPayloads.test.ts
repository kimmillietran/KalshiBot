import { describe, expect, it, vi } from "vitest";

import fixture from "@/lib/data/importers/kalshi/fixtures/KXBTC15M-25DEC311900-00-market-responses.json";
import { KalshiHistoricalHttpAdapter } from "@/lib/data/importers/kalshi";
import type { HistoricalImporter } from "@/lib/data/importers/kalshi/HistoricalImporter";
import type { HistoricalMarketRecord } from "@/lib/data/importers/kalshi/kalshiHistoricalTypes";

import { discoverSingleExpansionMarket } from "./discoverSingleExpansionMarket";
import { fetchSingleMarketDetailWire } from "./fetchSingleMarketExpansionPayloads";

function createMarketRecord(): HistoricalMarketRecord {
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
  };
}

describe("fetchSingleMarketExpansionPayloads", () => {
  it("fetches detail payload for smoke reporting", async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (String(url).includes(`/historical/markets/${fixture.ticker}`)) {
        return new Response(JSON.stringify({ market: fixture.detailMarket }), {
          status: 200,
        });
      }

      throw new Error(`Unexpected fetch URL: ${url}`);
    });

    const httpClient = new KalshiHistoricalHttpAdapter({ fetchImpl });
    const detailResult = await fetchSingleMarketDetailWire(
      httpClient,
      "https://example.test/trade-api/v2",
      fixture.ticker,
    );

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(detailResult.wire?.ticker).toBe(fixture.ticker);
  });

  it("discovers list payload via tickers filter without scanning the full expansion window", async () => {
    const listHistoricalMarkets = vi.fn(async (_series, _range, pagination) => {
      expect(pagination?.tickers).toBe(fixture.ticker);
      return {
        markets: [createMarketRecord()],
        cursor: "",
        provenance: {
          source: "kalshi-historical-api",
          fetchedAt: "2026-07-04T04:00:00.000Z",
          requestPath: `/historical/markets?tickers=${fixture.ticker}&limit=100`,
        },
      };
    });

    const importer: HistoricalImporter = {
      listHistoricalMarkets,
      getMarketCandlesticks: vi.fn(),
      getHistoricalTrades: vi.fn(),
      getHistoricalCutoff: vi.fn(),
      getHistoricalMarket: vi.fn(),
      getSettlementResult: vi.fn(),
    };

    const result = await discoverSingleExpansionMarket(
      { marketTicker: fixture.ticker, seriesTicker: "KXBTC15M" },
      { importer },
    );

    expect(listHistoricalMarkets).toHaveBeenCalledTimes(1);
    expect(result?.market.listMarketWire.expiration_value).toBe("94210.55");
  });
});
