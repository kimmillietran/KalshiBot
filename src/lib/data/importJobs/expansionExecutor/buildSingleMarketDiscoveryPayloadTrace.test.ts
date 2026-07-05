import { describe, expect, it } from "vitest";

import fixture from "@/lib/data/importers/kalshi/fixtures/KXBTC15M-25DEC311900-00-market-responses.json";

import { buildSingleMarketDiscoveryPayloadTrace } from "./buildSingleMarketDiscoveryPayloadTrace";
import { discoverSingleExpansionMarket } from "./discoverSingleExpansionMarket";
import type { HistoricalImporter } from "@/lib/data/importers/kalshi/HistoricalImporter";
import type { HistoricalMarketRecord } from "@/lib/data/importers/kalshi/kalshiHistoricalTypes";
import { vi } from "vitest";

const GENERATED_AT = "2026-07-04T04:00:00.000Z";

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

describe("buildSingleMarketDiscoveryPayloadTrace", () => {
  it("reports expiration_value at each pipeline stage for KXBTC15M-25DEC311900-00", async () => {
    const provenance = {
      source: "kalshi-historical-api" as const,
      fetchedAt: GENERATED_AT,
      requestPath: `/historical/markets?tickers=${fixture.ticker}`,
    };
    const rawMarketRecord = createMarketRecord();

    const importer: HistoricalImporter = {
      listHistoricalMarkets: vi.fn(async () => ({
        markets: [rawMarketRecord],
        cursor: "",
        provenance,
      })),
      getMarketCandlesticks: vi.fn(),
      getHistoricalTrades: vi.fn(),
      getHistoricalCutoff: vi.fn(),
      getHistoricalMarket: vi.fn(),
      getSettlementResult: vi.fn(),
    };

    const discovery = await discoverSingleExpansionMarket(
      { marketTicker: fixture.ticker, seriesTicker: "KXBTC15M" },
      { importer, now: () => new Date(GENERATED_AT) },
    );

    expect(discovery).not.toBeNull();

    const trace = buildSingleMarketDiscoveryPayloadTrace({
      pagesScanned: discovery!.pagesFetched,
      tickerFound: true,
      foundOnPage: discovery!.foundOnPage,
      rawMarketRecord: discovery!.rawMarketRecord,
      normalizedMarket: discovery!.normalizedMarket,
      listMarketWire: discovery!.market.listMarketWire,
      configMetadataListWire: discovery!.market.listMarketWire,
      reconciliationListWire: discovery!.market.listMarketWire,
      reconciliationMergedWire: {
        ...fixture.detailMarket,
        expiration_value: fixture.listMarket.expiration_value,
      },
    });

    expect(trace.tickerFound).toBe(true);
    expect(trace.rawDiscoveredMarketHasExpirationValue).toBe(true);
    expect(trace.listMarketWireHasExpirationValue).toBe(true);
    expect(trace.reconciliationInputHasExpirationValue).toBe(true);
    expect(trace.reconciliationOutputHasExpirationValue).toBe(true);
    expect(trace.rawDiscoveredMarketTopLevelKeys).toContain("expirationValue");
  });
});
