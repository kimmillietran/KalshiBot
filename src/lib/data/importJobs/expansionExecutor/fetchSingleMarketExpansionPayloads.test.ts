import { describe, expect, it, vi } from "vitest";

import fixture from "@/lib/data/importers/kalshi/fixtures/KXBTC15M-25DEC311900-00-market-responses.json";
import { KalshiHistoricalHttpAdapter } from "@/lib/data/importers/kalshi";

import {
  fetchSingleMarketDetailWire,
  fetchSingleMarketListWire,
} from "./fetchSingleMarketExpansionPayloads";

describe("fetchSingleMarketExpansionPayloads", () => {
  it("fetches list and detail payloads with at most one list page request", async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (String(url).includes("/historical/markets?")) {
        return new Response(
          JSON.stringify({
            markets: [fixture.listMarket],
            cursor: "next-page-should-not-be-used",
          }),
          { status: 200 },
        );
      }

      if (String(url).includes(`/historical/markets/${fixture.ticker}`)) {
        return new Response(JSON.stringify({ market: fixture.detailMarket }), {
          status: 200,
        });
      }

      throw new Error(`Unexpected fetch URL: ${url}`);
    });

    const httpClient = new KalshiHistoricalHttpAdapter({ fetchImpl });
    const listResult = await fetchSingleMarketListWire(
      httpClient,
      "https://example.test/trade-api/v2",
      {
        marketTicker: fixture.ticker,
        seriesTicker: "KXBTC15M",
      },
      "2026-07-04T04:00:00.000Z",
    );
    const detailResult = await fetchSingleMarketDetailWire(
      httpClient,
      "https://example.test/trade-api/v2",
      fixture.ticker,
    );

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(listResult.wire?.expiration_value).toBe("94210.55");
    expect(detailResult.wire?.ticker).toBe(fixture.ticker);
  });

  it("does not paginate when the ticker is absent from the first list page", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({
          markets: [{ ...fixture.listMarket, ticker: "OTHER-TICKER" }],
          cursor: "next-page",
        }),
        { status: 200 },
      ),
    );

    const httpClient = new KalshiHistoricalHttpAdapter({ fetchImpl });
    const listResult = await fetchSingleMarketListWire(
      httpClient,
      "https://example.test/trade-api/v2",
      {
        marketTicker: fixture.ticker,
        seriesTicker: "KXBTC15M",
      },
      "2026-07-04T04:00:00.000Z",
    );

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(listResult.wire).toBeNull();
    expect(listResult.unavailableReason).toContain("pagination disabled");
  });
});
