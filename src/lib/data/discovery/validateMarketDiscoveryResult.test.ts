import { describe, expect, it } from "vitest";

import { MarketDiscoveryErrorCode, type DiscoveredMarket } from "./discoveryTypes";
import { normalizeDiscoveredMarket } from "./normalizeDiscoveredMarket";
import { validateMarketDiscoveryResult } from "./validateMarketDiscoveryResult";

const PROVENANCE = {
  source: "kalshi-historical-api" as const,
  fetchedAt: "2026-06-27T12:00:00.000Z",
  requestPath: "/historical/markets?series_ticker=KXBTC15M&limit=100",
};

function discoveredMarket(
  overrides: Partial<DiscoveredMarket> = {},
): DiscoveredMarket {
  return {
    marketTicker: "KXBTC15M-26JUN270115-15",
    eventTicker: "KXBTC15M-26JUN270115",
    seriesTicker: "KXBTC15M",
    title: null,
    subtitle: null,
    status: "finalized",
    openTime: "2026-06-27T01:00:00.000Z",
    closeTime: "2026-06-27T01:15:00.000Z",
    settlementTime: "2026-06-27T01:20:00.000Z",
    expirationValue: "60010.25",
    listMarketWire: {
      ticker: "KXBTC15M-26JUN270115-15",
      event_ticker: "KXBTC15M-26JUN270115",
      series_ticker: "KXBTC15M",
      status: "finalized",
      open_time: "2026-06-27T01:00:00.000Z",
      close_time: "2026-06-27T01:15:00.000Z",
      expiration_value: "60010.25",
    },
    provenance: PROVENANCE,
    ...overrides,
  };
}

describe("validateMarketDiscoveryResult", () => {
  it("accepts a valid discovered market set", () => {
    const validation = validateMarketDiscoveryResult([discoveredMarket()]);

    expect(validation.valid).toBe(true);
    expect(validation.errors).toEqual([]);
  });

  it("flags empty discovery results", () => {
    const validation = validateMarketDiscoveryResult([]);

    expect(validation.valid).toBe(false);
    expect(validation.errors[0]?.errorCode).toBe(
      MarketDiscoveryErrorCode.EMPTY_RESULTS,
    );
  });

  it("flags missing market tickers", () => {
    const validation = validateMarketDiscoveryResult([
      discoveredMarket({ marketTicker: "   " }),
    ]);

    expect(validation.valid).toBe(false);
    expect(validation.errors[0]?.errorCode).toBe(
      MarketDiscoveryErrorCode.MISSING_MARKET_TICKER,
    );
  });

  it("flags duplicate market tickers", () => {
    const market = discoveredMarket();
    const validation = validateMarketDiscoveryResult([market, market]);

    expect(validation.valid).toBe(false);
    expect(validation.errors[0]?.errorCode).toBe(
      MarketDiscoveryErrorCode.DUPLICATE_MARKET_TICKER,
    );
  });

  it("flags malformed timestamps", () => {
    const validation = validateMarketDiscoveryResult([
      discoveredMarket({ openTime: "not-a-timestamp" }),
    ]);

    expect(validation.valid).toBe(false);
    expect(validation.errors[0]?.errorCode).toBe(
      MarketDiscoveryErrorCode.MALFORMED_TIMESTAMP,
    );
  });

  it("flags unsupported status values", () => {
    const validation = validateMarketDiscoveryResult([
      discoveredMarket({ status: "mystery" }),
    ]);

    expect(validation.valid).toBe(false);
    expect(validation.errors[0]?.errorCode).toBe(
      MarketDiscoveryErrorCode.UNSUPPORTED_STATUS,
    );
  });
});

describe("normalizeDiscoveredMarket + validate integration", () => {
  it("rejects malformed timestamps produced from invalid wire times", () => {
    const discovered = normalizeDiscoveredMarket({
      seriesTicker: "KXBTC15M",
      market: {
        ticker: "KXBTC15M-BAD-TIME",
        eventTicker: "KXBTC15M-EVENT",
        status: "finalized",
        result: "yes",
        openTime: "definitely-not-a-time",
        closeTime: "2026-06-27T01:15:00Z",
        settlementTs: null,
        settlementValueDollars: null,
        expirationValue: "1",
        floorStrike: null,
      },
      provenance: PROVENANCE,
    });

    const validation = validateMarketDiscoveryResult([discovered]);
    expect(validation.valid).toBe(false);
    expect(validation.errors[0]?.marketTicker).toBe("KXBTC15M-BAD-TIME");
  });
});
