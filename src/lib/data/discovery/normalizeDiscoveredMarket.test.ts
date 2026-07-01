import { describe, expect, it } from "vitest";

import type { HistoricalMarketRecord } from "@/lib/data/importers/kalshi/kalshiHistoricalTypes";

import { normalizeDiscoveredMarket } from "./normalizeDiscoveredMarket";

const PROVENANCE = {
  source: "kalshi-historical-api" as const,
  fetchedAt: "2026-06-27T12:00:00.000Z",
  requestPath: "/historical/markets?series_ticker=KXBTC15M&limit=100",
  cursor: "next-page",
};

function sampleMarket(
  overrides: Partial<HistoricalMarketRecord> = {},
): HistoricalMarketRecord {
  return {
    ticker: "KXBTC15M-26JUN270115-15",
    eventTicker: "KXBTC15M-26JUN270115",
    status: "finalized",
    result: "yes",
    openTime: "2026-06-27T01:00:00Z",
    closeTime: "2026-06-27T01:15:00Z",
    settlementTs: "2026-06-27T01:20:00Z",
    settlementValueDollars: "1.0000",
    expirationValue: "60010.25",
    floorStrike: 59_990.31,
    title: "BTC price up in 15 minutes?",
    subtitle: "Above $59,990.31",
    seriesTicker: "KXBTC15M",
    ...overrides,
  };
}

describe("normalizeDiscoveredMarket", () => {
  it("normalizes historical market metadata into stable discovery JSON", () => {
    const discovered = normalizeDiscoveredMarket({
      seriesTicker: "KXBTC15M",
      market: sampleMarket(),
      provenance: PROVENANCE,
    });

    expect(discovered).toEqual({
      marketTicker: "KXBTC15M-26JUN270115-15",
      eventTicker: "KXBTC15M-26JUN270115",
      seriesTicker: "KXBTC15M",
      title: "BTC price up in 15 minutes?",
      subtitle: "Above $59,990.31",
      status: "finalized",
      openTime: "2026-06-27T01:00:00.000Z",
      closeTime: "2026-06-27T01:15:00.000Z",
      settlementTime: "2026-06-27T01:20:00.000Z",
      expirationValue: "60010.25",
      provenance: PROVENANCE,
    });
  });

  it("derives series ticker from event ticker when series metadata is absent", () => {
    const discovered = normalizeDiscoveredMarket({
      seriesTicker: "KXBTC15M",
      market: sampleMarket({ seriesTicker: null }),
      provenance: PROVENANCE,
    });

    expect(discovered.seriesTicker).toBe("KXBTC15M");
  });

  it("maps price.close metadata fields to null when absent", () => {
    const discovered = normalizeDiscoveredMarket({
      seriesTicker: "KXBTC15M",
      market: sampleMarket({
        title: null,
        subtitle: null,
        settlementTs: null,
      }),
      provenance: PROVENANCE,
    });

    expect(discovered.title).toBeNull();
    expect(discovered.subtitle).toBeNull();
    expect(discovered.settlementTime).toBeNull();
  });
});
