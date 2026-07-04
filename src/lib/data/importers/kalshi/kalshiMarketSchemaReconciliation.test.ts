import { describe, expect, it } from "vitest";

import fixture from "./fixtures/KXBTC15M-25DEC311900-00-market-responses.json";
import {
  discoveredMarketToKalshiListWireShape,
  KALSHI_DISCOVERY_LIST_MARKET_METADATA_KEY,
  mergeKalshiMarketWireFromListDetail,
  readKalshiDiscoveryListMarketFromMetadata,
} from "./kalshiMarketSchemaReconciliation";

const DISCOVERY_PROVENANCE = {
  source: "kalshi-historical-api" as const,
  fetchedAt: "2026-07-04T04:00:00.000Z",
  requestPath: fixture.listEndpoint,
};

describe("kalshiMarketSchemaReconciliation", () => {
  it("maps discovered markets to list wire snapshots without inventing absent fields", () => {
    const wire = discoveredMarketToKalshiListWireShape({
      marketTicker: fixture.ticker,
      eventTicker: "KXBTC15M-25DEC311900",
      seriesTicker: "KXBTC15M",
      status: "finalized",
      openTime: fixture.listMarket.open_time,
      closeTime: fixture.listMarket.close_time,
      settlementTime: fixture.listMarket.settlement_ts ?? null,
      expirationValue: fixture.listMarket.expiration_value,
      title: null,
      subtitle: null,
    });

    expect(wire.expiration_value).toBe("94210.55");
    expect(wire.result).toBeUndefined();
  });

  it("merges list expiration_value into detail payload for KXBTC15M-25DEC311900-00", () => {
    const reconciliation = mergeKalshiMarketWireFromListDetail({
      listMarket: fixture.listMarket,
      detailMarket: fixture.detailMarket,
    });

    expect(reconciliation.mergedFields).toEqual(["expiration_value"]);
    expect(reconciliation.mergedWire.expiration_value).toBe("94210.55");
    expect(reconciliation.detailMissingRequiredFields).toEqual(["expiration_value"]);
    expect(reconciliation.listMissingRequiredFields).toEqual([]);
  });

  it("does not overwrite non-empty detail fields with list values", () => {
    const reconciliation = mergeKalshiMarketWireFromListDetail({
      listMarket: {
        ...fixture.listMarket,
        close_time: "2025-12-31T19:30:00Z",
      },
      detailMarket: fixture.detailMarket,
    });

    expect(reconciliation.mergedWire.close_time).toBe(fixture.detailMarket.close_time);
    expect(reconciliation.mergedFields).toEqual(["expiration_value"]);
  });

  it("leaves genuinely malformed responses missing required fields after merge", () => {
    const reconciliation = mergeKalshiMarketWireFromListDetail({
      listMarket: {
        ticker: fixture.ticker,
        open_time: fixture.listMarket.open_time,
        close_time: fixture.listMarket.close_time,
      },
      detailMarket: {
        ticker: fixture.ticker,
        open_time: fixture.detailMarket.open_time,
        close_time: fixture.detailMarket.close_time,
      },
    });

    expect(reconciliation.mergedFields).toEqual([]);
    expect(reconciliation.mergedWire.expiration_value).toBeUndefined();
  });

  it("reads discovery list market metadata from import configs", () => {
    const metadata = {
      [KALSHI_DISCOVERY_LIST_MARKET_METADATA_KEY]: fixture.listMarket,
    };

    expect(readKalshiDiscoveryListMarketFromMetadata(metadata)).toEqual(fixture.listMarket);
  });

  it("builds list wire snapshots from discovered market provenance-bearing records", () => {
    const wire = discoveredMarketToKalshiListWireShape({
      marketTicker: fixture.ticker,
      eventTicker: "KXBTC15M-25DEC311900",
      seriesTicker: "KXBTC15M",
      status: "finalized",
      openTime: fixture.listMarket.open_time,
      closeTime: fixture.listMarket.close_time,
      settlementTime: fixture.listMarket.settlement_ts ?? null,
      expirationValue: fixture.listMarket.expiration_value,
      title: null,
      subtitle: null,
      provenance: DISCOVERY_PROVENANCE,
    });

    expect(wire.ticker).toBe(fixture.ticker);
    expect(wire.expiration_value).toBe(fixture.listMarket.expiration_value);
  });
});
