import { describe, expect, it } from "vitest";

import {
  kalshiMarketSchema,
  kalshiMarketsResponseSchema,
} from "./schemas";

const sampleMarket = {
  ticker: "KXBTC15M-26JUN261930-30",
  title: "BTC price up in next 15 mins?",
  status: "active",
  open_time: "2026-06-26T23:15:00Z",
  close_time: "2026-06-26T23:30:00Z",
  floor_strike: 59990.31,
};

describe("kalshiMarketSchema", () => {
  it("accepts a valid Kalshi market payload", () => {
    expect(kalshiMarketSchema.safeParse(sampleMarket).success).toBe(true);
  });

  it("rejects markets missing required fields", () => {
    const result = kalshiMarketSchema.safeParse({
      ticker: "KXBTC15M-26JUN261930-30",
    });
    expect(result.success).toBe(false);
  });
});

describe("kalshiMarketsResponseSchema", () => {
  it("accepts a markets list response", () => {
    const result = kalshiMarketsResponseSchema.safeParse({
      markets: [sampleMarket],
      cursor: "",
    });
    expect(result.success).toBe(true);
  });

  it("rejects non-array markets", () => {
    const result = kalshiMarketsResponseSchema.safeParse({
      markets: sampleMarket,
    });
    expect(result.success).toBe(false);
  });
});
