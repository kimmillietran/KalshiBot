import { describe, expect, it, vi } from "vitest";

import {
  discoverActiveBtcMarket,
  fetchKalshiMarkets,
} from "./kalshiServer";

const openMarket = {
  ticker: "KXBTC15M-26JUN261930-30",
  title: "BTC price up in next 15 mins?",
  status: "active",
  open_time: "2026-06-26T23:15:00Z",
  close_time: "2026-06-26T23:30:00Z",
  floor_strike: 59990.31,
};

function mockFetchSequence(responses: Array<{ status: number; body: unknown }>) {
  let call = 0;
  return vi.fn(async () => {
    const next = responses[call] ?? responses[responses.length - 1];
    call += 1;
    return {
      ok: next.status >= 200 && next.status < 300,
      status: next.status,
      statusText: "Error",
      text: async () => "",
      json: async () => next.body,
    } as Response;
  });
}

describe("fetchKalshiMarkets", () => {
  it("parses a valid markets response", async () => {
    const fetchImpl = mockFetchSequence([
      { status: 200, body: { markets: [openMarket], cursor: "" } },
    ]);

    await expect(fetchKalshiMarkets({ status: "open", fetchImpl })).resolves.toEqual(
      [openMarket],
    );
  });

  it("throws on rate limit responses", async () => {
    const fetchImpl = mockFetchSequence([{ status: 429, body: {} }]);

    await expect(
      fetchKalshiMarkets({ status: "open", fetchImpl }),
    ).rejects.toThrow("rate limit");
  });
});

describe("discoverActiveBtcMarket", () => {
  it("returns the selected open market", async () => {
    const fetchImpl = mockFetchSequence([
      { status: 200, body: { markets: [openMarket], cursor: "" } },
    ]);

    const result = await discoverActiveBtcMarket(
      fetchImpl,
      new Date("2026-06-26T23:20:00Z"),
    );

    expect(result).toMatchObject({
      kind: "market",
      market: {
        ticker: openMarket.ticker,
        targetPrice: 59990.31,
      },
    });
  });

  it("falls back to unopened markets when open list is empty", async () => {
    const unopened = {
      ...openMarket,
      ticker: "KXBTC15M-NEXT",
      status: "initialized",
      open_time: "2026-06-26T23:30:00Z",
      close_time: "2026-06-26T23:45:00Z",
    };

    const fetchImpl = mockFetchSequence([
      { status: 200, body: { markets: [], cursor: "" } },
      { status: 200, body: { markets: [unopened], cursor: "" } },
    ]);

    const result = await discoverActiveBtcMarket(
      fetchImpl,
      new Date("2026-06-26T23:20:00Z"),
    );

    expect(result).toMatchObject({
      kind: "market",
      market: { ticker: unopened.ticker },
    });
  });

  it("returns no-market when discovery finds nothing", async () => {
    const fetchImpl = mockFetchSequence([
      { status: 200, body: { markets: [], cursor: "" } },
      { status: 200, body: { markets: [], cursor: "" } },
    ]);

    const result = await discoverActiveBtcMarket(
      fetchImpl,
      new Date("2026-06-26T23:20:00Z"),
    );

    expect(result).toEqual({
      kind: "no-market",
      message: "No active BTC 15m market",
    });
  });
});
