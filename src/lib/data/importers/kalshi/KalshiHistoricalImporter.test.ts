import { describe, expect, it, vi } from "vitest";

import fixture from "./fixtures/KXBTC15M-25DEC311900-00-market-responses.json";
import {
  KalshiHistoricalImporter,
  KalshiHistoricalImporterError,
  type KalshiHistoricalHttpClient,
} from "./KalshiHistoricalImporter";
import { KalshiHistoricalBidAskAuditFinding } from "./kalshiHistoricalBidAskAudit";

const FIXED_NOW = new Date("2026-06-27T12:00:00.000Z");

const sampleMarketWire = {
  ticker: "KXBTC15M-26JUN270115-15",
  event_ticker: "KXBTC15M-26JUN270115",
  status: "finalized",
  result: "yes",
  open_time: "2026-06-27T01:00:00Z",
  close_time: "2026-06-27T01:15:00Z",
  settlement_ts: "2026-06-27T01:20:00Z",
  settlement_value_dollars: "1.0000",
  expiration_value: "60010.25",
  floor_strike: 59990.31,
};

function createFakeClient(
  handler: (
    url: string,
  ) => {
    status: number;
    body: unknown;
    headers?: Readonly<Record<string, string>>;
  },
): KalshiHistoricalHttpClient {
  return {
    get: vi.fn(async (url: string) => handler(url)),
  };
}

function createImporter(
  client: KalshiHistoricalHttpClient,
  options?: {
    persistMarketParseDiagnostics?: boolean;
    persistMarketParseDiagnosticsIo?: {
      writeFile: (path: string, data: string) => void;
      mkdirSync: (path: string, options: { recursive: boolean }) => void;
    };
  },
) {
  return new KalshiHistoricalImporter({
    httpClient: client,
    baseUrl: "https://example.test/trade-api/v2",
    now: () => FIXED_NOW,
    persistMarketParseDiagnostics: options?.persistMarketParseDiagnostics,
    persistMarketParseDiagnosticsIo: options?.persistMarketParseDiagnosticsIo,
  });
}

describe("KalshiHistoricalImporter", () => {
  it("lists historical markets with parsed metadata and provenance", async () => {
    const client = createFakeClient((url) => {
      expect(url).toBe(
        "https://example.test/trade-api/v2/historical/markets?series_ticker=KXBTC15M&limit=100",
      );
      return {
        status: 200,
        body: {
          markets: [sampleMarketWire],
          cursor: "next-page",
        },
      };
    });

    const importer = createImporter(client);
    const page = await importer.listHistoricalMarkets("KXBTC15M", undefined, {
      limit: 100,
    });

    expect(page.markets).toEqual([
      {
        ticker: "KXBTC15M-26JUN270115-15",
        eventTicker: "KXBTC15M-26JUN270115",
        status: "finalized",
        result: "yes",
        openTime: "2026-06-27T01:00:00Z",
        closeTime: "2026-06-27T01:15:00Z",
        settlementTs: "2026-06-27T01:20:00Z",
        settlementValueDollars: "1.0000",
        expirationValue: "60010.25",
        floorStrike: 59990.31,
        title: null,
        subtitle: null,
        seriesTicker: null,
      },
    ]);
    expect(page.cursor).toBe("next-page");
    expect(page.provenance).toEqual({
      source: "kalshi-historical-api",
      fetchedAt: FIXED_NOW.toISOString(),
      requestPath: "/historical/markets?series_ticker=KXBTC15M&limit=100",
      cursor: "next-page",
    });
  });

  it("attaches Retry-After metadata to 429 importer errors", async () => {
    const client = createFakeClient(() => ({
      status: 429,
      body: { message: "rate limited" },
      headers: { "retry-after": "3" },
    }));

    const importer = createImporter(client);

    await expect(importer.listHistoricalMarkets("KXBTC15M")).rejects.toMatchObject({
      status: 429,
      retryAfterMs: 3000,
    });
  });

  it("preserves optional title and subtitle metadata from market wire", async () => {
    const client = createFakeClient(() => ({
      status: 200,
      body: {
        markets: [
          {
            ...sampleMarketWire,
            title: "BTC price up in 15 minutes?",
            yes_sub_title: "Above $59,990.31",
            series_ticker: "KXBTC15M",
          },
        ],
        cursor: "",
      },
    }));

    const importer = createImporter(client);
    const page = await importer.listHistoricalMarkets("KXBTC15M");

    expect(page.markets[0]).toMatchObject({
      title: "BTC price up in 15 minutes?",
      subtitle: "Above $59,990.31",
      seriesTicker: "KXBTC15M",
    });
  });

  it("passes pagination cursor through to the trades endpoint", async () => {
    const client = createFakeClient((url) => {
      expect(url).toContain("cursor=page-2");
      expect(url).toContain("ticker=KXBTC15M-26JUN270115-15");
      return {
        status: 200,
        body: {
          trades: [
            {
              trade_id: "trade-1",
              ticker: "KXBTC15M-26JUN270115-15",
              count_fp: "5.00",
              yes_price_dollars: "0.1600",
              no_price_dollars: "0.8400",
              created_time: "2026-06-27T01:10:00Z",
              is_block_trade: false,
            },
          ],
          cursor: "",
        },
      };
    });

    const importer = createImporter(client);
    const page = await importer.getHistoricalTrades(
      { ticker: "KXBTC15M-26JUN270115-15" },
      undefined,
      { cursor: "page-2" },
    );

    expect(page.trades[0]?.tradeId).toBe("trade-1");
    expect(page.provenance.cursor).toBe("");
  });

  it("parses candlestick response shape", async () => {
    const client = createFakeClient((url) => {
      expect(url).toContain("/historical/markets/KXBTC-OLD/candlesticks");
      expect(url).toContain("period_interval=1");
      return {
        status: 200,
        body: {
          ticker: "KXBTC-OLD",
          candlesticks: [
            {
              end_period_ts: 1_700_000_060,
              volume: "12.00",
              open_interest: "45.00",
              price: { close: "0.5500" },
            },
          ],
        },
      };
    });

    const importer = createImporter(client);
    const result = await importer.getMarketCandlesticks("KXBTC-OLD", 1, {
      startTs: 1_700_000_000,
      endTs: 1_700_000_120,
    });

    expect(result.candlesticks).toEqual([
      {
        endPeriodTs: 1_700_000_060,
        volume: "12.00",
        openInterest: "45.00",
        priceClose: "0.5500",
      },
    ]);
    expect(result.provenance.requestPath).toContain("start_ts=1700000000");
  });

  it("documents trade-close-only candlesticks from the historical API", async () => {
    expect(KalshiHistoricalBidAskAuditFinding.HAS_YES_BID_OHLC).toBe(false);
    expect(KalshiHistoricalBidAskAuditFinding.HAS_YES_ASK_OHLC).toBe(false);

    const client = createFakeClient(() => ({
      status: 200,
      body: {
        ticker: "KXBTC-OLD",
        candlesticks: [
          {
            end_period_ts: 1_700_000_060,
            volume: "12.00",
            open_interest: "45.00",
            price: { close: "0.5500", open: "0.5400", high: "0.5600", low: "0.5300" },
          },
        ],
      },
    }));

    const importer = createImporter(client);
    const result = await importer.getMarketCandlesticks("KXBTC-OLD", 1, {
      startTs: 1_700_000_000,
      endTs: 1_700_000_120,
    });

    expect(result.candlesticks[0]?.priceClose).toBe("0.5500");
  });

  it("parses historical cutoff timestamps", async () => {
    const client = createFakeClient((url) => {
      expect(url).toBe("https://example.test/trade-api/v2/historical/cutoff");
      return {
        status: 200,
        body: {
          market_settled_ts: "2026-03-27T00:00:00Z",
          trades_created_ts: "2026-03-27T00:00:00Z",
          orders_updated_ts: "2026-03-27T00:00:00Z",
        },
      };
    });

    const importer = createImporter(client);
    const cutoff = await importer.getHistoricalCutoff();

    expect(cutoff.marketSettledTs).toBe("2026-03-27T00:00:00Z");
    expect(cutoff.provenance.source).toBe("kalshi-historical-api");
  });

  it("returns full market record from historical market endpoint", async () => {
    const client = createFakeClient((url) => {
      expect(url).toBe(
        "https://example.test/trade-api/v2/historical/markets/KXBTC15M-26JUN270115-15",
      );
      return {
        status: 200,
        body: { market: sampleMarketWire },
      };
    });

    const importer = createImporter(client);
    const market = await importer.getHistoricalMarket("KXBTC15M-26JUN270115-15");

    expect(market).toEqual({
      ticker: "KXBTC15M-26JUN270115-15",
      eventTicker: "KXBTC15M-26JUN270115",
      status: "finalized",
      result: "yes",
      openTime: "2026-06-27T01:00:00Z",
      closeTime: "2026-06-27T01:15:00Z",
      settlementTs: "2026-06-27T01:20:00Z",
      settlementValueDollars: "1.0000",
      expirationValue: "60010.25",
      floorStrike: 59990.31,
      title: null,
      subtitle: null,
      seriesTicker: null,
    });
  });

  it("returns null when historical market endpoint responds with 404", async () => {
    const client = createFakeClient(() => ({
      status: 404,
      body: { code: "not_found", message: "market not found" },
    }));

    const importer = createImporter(client);

    await expect(importer.getHistoricalMarket("KXBTC-MISSING")).resolves.toBeNull();
  });

  it("throws actionable diagnostics for KXBTC15M-25DEC311900-00 detail payload missing expiration_value", async () => {
    const writes = new Map<string, string>();
    const client = createFakeClient((url) => {
      expect(url).toBe(
        "https://example.test/trade-api/v2/historical/markets/KXBTC15M-25DEC311900-00",
      );
      return {
        status: 200,
        body: { market: fixture.detailMarket },
      };
    });

    const importer = createImporter(client, {
      persistMarketParseDiagnostics: true,
      persistMarketParseDiagnosticsIo: {
        writeFile: (path, data) => {
          writes.set(path, data);
        },
        mkdirSync: () => {},
      },
    });

    await expect(importer.getHistoricalMarket(fixture.ticker)).rejects.toMatchObject({
      name: "KalshiMarketImportCompatibilityError",
      message: expect.stringContaining("missing required fields: expiration_value"),
    });
    expect(writes.has("data/debug/kalshi-market-KXBTC15M-25DEC311900-00.json")).toBe(true);
  });

  it("imports KXBTC15M-25DEC311900-00 when discovery list payload supplies expiration_value", async () => {
    const client = createFakeClient(() => ({
      status: 200,
      body: { market: fixture.detailMarket },
    }));

    const importer = createImporter(client);
    const market = await importer.getHistoricalMarket(fixture.ticker, {
      listMarketWire: fixture.listMarket,
    });

    expect(market?.expirationValue).toBe("94210.55");
    expect(market?.closeTime).toBe(fixture.detailMarket.close_time);
  });

  it("still throws diagnostics when both list and detail payloads lack required fields", async () => {
    const client = createFakeClient(() => ({
      status: 200,
      body: {
        market: {
          ticker: fixture.ticker,
          event_ticker: "KXBTC15M-25DEC311900",
          status: "finalized",
          open_time: fixture.detailMarket.open_time,
          close_time: fixture.detailMarket.close_time,
        },
      },
    }));

    const importer = createImporter(client, { persistMarketParseDiagnostics: false });

    await expect(
      importer.getHistoricalMarket(fixture.ticker, {
        listMarketWire: {
          ticker: fixture.ticker,
          open_time: fixture.listMarket.open_time,
          close_time: fixture.listMarket.close_time,
        },
      }),
    ).rejects.toMatchObject({
      name: "KalshiMarketImportCompatibilityError",
      message: expect.stringContaining("missing required fields: expiration_value"),
    });
  });

  it("returns settlement result from historical market endpoint", async () => {
    const client = createFakeClient((url) => {
      expect(url).toBe(
        "https://example.test/trade-api/v2/historical/markets/KXBTC15M-26JUN270115-15",
      );
      return {
        status: 200,
        body: { market: sampleMarketWire },
      };
    });

    const importer = createImporter(client);
    const settlement = await importer.getSettlementResult("KXBTC15M-26JUN270115-15");

    expect(settlement.result).toBe("yes");
    expect(settlement.settlementValueDollars).toBe("1.0000");
    expect(settlement.settlementTs).toBe("2026-06-27T01:20:00Z");
  });

  it("throws KalshiHistoricalImporterError on API errors", async () => {
    const client = createFakeClient(() => ({
      status: 400,
      body: { code: "bad_request", message: "invalid cursor" },
    }));

    const importer = createImporter(client);

    await expect(importer.getHistoricalCutoff()).rejects.toMatchObject({
      name: "KalshiHistoricalImporterError",
      status: 400,
      code: "bad_request",
      message: "invalid cursor",
    } satisfies Partial<KalshiHistoricalImporterError>);
  });

  it("preserves null settlement fields truthfully", async () => {
    const client = createFakeClient(() => ({
      status: 200,
      body: {
        market: {
          ...sampleMarketWire,
          settlement_ts: null,
          settlement_value_dollars: null,
          result: "",
        },
      },
    }));

    const importer = createImporter(client);
    const settlement = await importer.getSettlementResult("KXBTC-OPEN");

    expect(settlement.settlementTs).toBeNull();
    expect(settlement.settlementValueDollars).toBeNull();
    expect(settlement.result).toBe("");
  });

  it("is deterministic for identical fake responses", async () => {
    const handler = () => ({
      status: 200,
      body: {
        market_settled_ts: "2026-03-27T00:00:00Z",
        trades_created_ts: "2026-03-27T00:00:00Z",
        orders_updated_ts: "2026-03-27T00:00:00Z",
      },
    });

    const first = createImporter(createFakeClient(handler));
    const second = createImporter(createFakeClient(handler));

    await expect(first.getHistoricalCutoff()).resolves.toEqual(
      await second.getHistoricalCutoff(),
    );
  });

  it("does not call global fetch or localStorage", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const storageSpy = vi.spyOn(Storage.prototype, "setItem");

    const client = createFakeClient(() => ({
      status: 200,
      body: {
        market_settled_ts: "2026-03-27T00:00:00Z",
        trades_created_ts: "2026-03-27T00:00:00Z",
        orders_updated_ts: "2026-03-27T00:00:00Z",
      },
    }));

    await createImporter(client).getHistoricalCutoff();

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(storageSpy).not.toHaveBeenCalled();

    fetchSpy.mockRestore();
    storageSpy.mockRestore();
  });

  it("rejects seriesTicker-only trade scope without inventing ticker filter", async () => {
    const client = createFakeClient(() => ({
      status: 200,
      body: { trades: [], cursor: "" },
    }));
    const importer = createImporter(client);

    await expect(
      importer.getHistoricalTrades({ seriesTicker: "KXBTC15M" }),
    ).rejects.toThrow(/requires ticker/i);
    expect(client.get).not.toHaveBeenCalled();
  });

  it("throws KalshiHistoricalImporterError on invalid 200 response body", async () => {
    const client = createFakeClient(() => ({
      status: 200,
      body: "not-json-object",
    }));
    const importer = createImporter(client);

    await expect(importer.getHistoricalCutoff()).rejects.toMatchObject({
      name: "KalshiHistoricalImporterError",
      status: 200,
      message: /Invalid cutoff response/i,
    });
  });
});
