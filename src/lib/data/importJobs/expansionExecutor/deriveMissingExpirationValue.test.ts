import { describe, expect, it, vi } from "vitest";

import { DataQualityFlag } from "@/lib/data/schemas";

import type { ExpansionDiscoveredMarket } from "./expansionExecutorTypes";
import {
  deriveMissingExpirationValue,
  formatDerivedExpirationValue,
  hasOfficialKalshiExpirationValue,
  isDerivedExpirationValueEligible,
  isOnlyMissingExpirationValue,
} from "./deriveMissingExpirationValue";

const GENERATED_AT = "2026-07-06T04:00:00.000Z";

function createDec2025Market(
  overrides: Partial<ExpansionDiscoveredMarket> = {},
): ExpansionDiscoveredMarket {
  return {
    marketTicker: "KXBTC15M-25DEC311900-00",
    seriesTicker: "KXBTC15M",
    eventTicker: "KXBTC15M-25DEC311900",
    status: "finalized",
    openTime: "2025-12-31T18:45:00.000Z",
    closeTime: "2025-12-31T19:00:00.000Z",
    settlementTime: "2025-12-31T19:05:00.000Z",
    expirationValue: "",
    title: null,
    subtitle: null,
    listMarketWire: {
      ticker: "KXBTC15M-25DEC311900-00",
      event_ticker: "KXBTC15M-25DEC311900",
      series_ticker: "KXBTC15M",
      status: "finalized",
      result: "yes",
      open_time: "2025-12-31T18:45:00.000Z",
      close_time: "2025-12-31T19:00:00.000Z",
      floor_strike: 94180.12,
    },
    provenance: {
      source: "kalshi-historical-api",
      fetchedAt: GENERATED_AT,
      requestPath: "/historical/markets?series_ticker=KXBTC15M",
    },
    ...overrides,
  };
}

describe("deriveMissingExpirationValue", () => {
  it("detects official expiration_value and skips derivation eligibility", () => {
    const market = createDec2025Market({
      expirationValue: "94210.55",
      listMarketWire: {
        ...createDec2025Market().listMarketWire,
        expiration_value: "94210.55",
      },
    });

    expect(hasOfficialKalshiExpirationValue(market.listMarketWire)).toBe(true);
    expect(isDerivedExpirationValueEligible(market)).toBe(false);
  });

  it("requires only expiration_value to be missing for opt-in retry", () => {
    expect(isOnlyMissingExpirationValue(["expiration_value"])).toBe(true);
    expect(isOnlyMissingExpirationValue(["expiration_value", "close_time"])).toBe(false);
  });

  it("derives expiration_value from Coinbase close and preserves official result", async () => {
    const market = createDec2025Market();
    const fetchCoinbaseCloseUsdAtCloseTime = vi.fn(async () => ({
      closeUsd: 94210.547,
      sourceTimestamp: "2025-12-31T19:00:00.000Z",
    }));

    const result = await deriveMissingExpirationValue({
      market,
      derivedAt: GENERATED_AT,
      fetchCoinbaseCloseUsdAtCloseTime,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.market.listMarketWire.expiration_value).toBe("94210.55");
    expect(result.market.listMarketWire.result).toBe("yes");
    expect(result.provenance).toMatchObject({
      source: "coinbase-spot",
      interval: "1m",
      derivedAt: GENERATED_AT,
      sourceTimestamp: "2025-12-31T19:00:00.000Z",
      derivationRuleVersion: "m9.38-coinbase-1m-close-at-close-time-v1",
      expirationValue: "94210.55",
    });
  });

  it("returns unsupported when Coinbase close is unavailable", async () => {
    const result = await deriveMissingExpirationValue({
      market: createDec2025Market(),
      derivedAt: GENERATED_AT,
      fetchCoinbaseCloseUsdAtCloseTime: vi.fn(async () => null),
    });

    expect(result.ok).toBe(false);
  });

  it("does not derive for non-KXBTC15M markets", async () => {
    const market = createDec2025Market({
      marketTicker: "OTHER-25DEC311900-00",
      seriesTicker: "OTHER",
      listMarketWire: {
        ...createDec2025Market().listMarketWire,
        ticker: "OTHER-25DEC311900-00",
        series_ticker: "OTHER",
      },
    });

    const result = await deriveMissingExpirationValue({
      market,
      derivedAt: GENERATED_AT,
      fetchCoinbaseCloseUsdAtCloseTime: vi.fn(async () => ({
        closeUsd: 100,
        sourceTimestamp: "2025-12-31T19:00:00.000Z",
      })),
    });

    expect(result.ok).toBe(false);
  });

  it("formats derived values to two decimal places", () => {
    expect(formatDerivedExpirationValue(94210.547)).toBe("94210.55");
  });
});

describe("DataQualityFlag backward compatibility", () => {
  it("includes derived-expiration-value without breaking existing flags", () => {
    expect(DataQualityFlag.DERIVED_EXPIRATION_VALUE).toBe("derived-expiration-value");
    expect(DataQualityFlag.SOURCE_DEGRADED).toBe("source-degraded");
  });
});
