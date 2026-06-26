import { describe, expect, it } from "vitest";

import type { KalshiMarket } from "./schemas";
import {
  computeTimeRemainingMs,
  formatCountdown,
  formatExpirationTime,
  mapKalshiMarketToActiveBtc,
  selectOpenMarket,
  selectUnopenedMarket,
} from "./utils";

const baseMarket: KalshiMarket = {
  ticker: "KXBTC15M-26JUN261930-30",
  title: "BTC price up in next 15 mins?",
  status: "active",
  open_time: "2026-06-26T23:15:00Z",
  close_time: "2026-06-26T23:30:00Z",
  floor_strike: 59990.31,
};

describe("computeTimeRemainingMs", () => {
  it("returns remaining milliseconds until close", () => {
    const now = Date.parse("2026-06-26T23:20:00Z");
    expect(computeTimeRemainingMs("2026-06-26T23:30:00Z", now)).toBe(600_000);
  });

  it("returns zero when close time has passed", () => {
    const now = Date.parse("2026-06-26T23:35:00Z");
    expect(computeTimeRemainingMs("2026-06-26T23:30:00Z", now)).toBe(0);
  });
});

describe("formatCountdown", () => {
  it("formats sub-hour countdown as MM:SS", () => {
    expect(formatCountdown(8 * 60_000 + 42_000)).toBe("08:42");
  });

  it("returns 00:00 at expiry", () => {
    expect(formatCountdown(0)).toBe("00:00");
  });
});

describe("formatExpirationTime", () => {
  it("formats close time for display", () => {
    const formatted = formatExpirationTime("2026-06-26T23:30:00Z");
    expect(formatted).toMatch(/PM|AM/);
  });
});

describe("selectOpenMarket", () => {
  it("returns the only open market", () => {
    expect(selectOpenMarket([baseMarket])).toEqual(baseMarket);
  });

  it("chooses the nearest upcoming close_time", () => {
    const sooner: KalshiMarket = {
      ...baseMarket,
      ticker: "KXBTC15M-SOON",
      close_time: "2026-06-26T23:25:00Z",
    };
    const later: KalshiMarket = {
      ...baseMarket,
      ticker: "KXBTC15M-LATER",
      close_time: "2026-06-26T23:40:00Z",
    };
    const now = Date.parse("2026-06-26T23:20:00Z");

    expect(selectOpenMarket([later, sooner], now)).toEqual(sooner);
  });
});

describe("selectUnopenedMarket", () => {
  it("chooses the earliest open_time", () => {
    const earlier: KalshiMarket = {
      ...baseMarket,
      ticker: "KXBTC15M-EARLY",
      open_time: "2026-06-26T23:30:00Z",
    };
    const later: KalshiMarket = {
      ...baseMarket,
      ticker: "KXBTC15M-LATE",
      open_time: "2026-06-26T23:45:00Z",
    };

    expect(selectUnopenedMarket([later, earlier])).toEqual(earlier);
  });
});

describe("mapKalshiMarketToActiveBtc", () => {
  it("maps vendor fields into the domain model", () => {
    const now = new Date("2026-06-26T23:20:00Z");
    const mapped = mapKalshiMarketToActiveBtc(baseMarket, now);

    expect(mapped).toMatchObject({
      ticker: baseMarket.ticker,
      title: baseMarket.title,
      targetPrice: 59990.31,
      status: "active",
      source: "kalshi",
      isFallback: false,
      timeRemainingMs: 600_000,
    });
    expect(mapped.updatedAt).toBe(now.toISOString());
  });
});
