import { describe, expect, it } from "vitest";

import {
  findRawTickerLeaksInText,
  isRawKalshiTicker,
  VISIBLE_RAW_TICKER_PATTERN,
} from "./tickerVisibility";

describe("tickerVisibility", () => {
  it("detects raw Kalshi tickers", () => {
    expect(isRawKalshiTicker("KXBTC15M-26JUN270100-00")).toBe(true);
    expect(isRawKalshiTicker("BTC 15m · Live Kalshi contract")).toBe(false);
    expect(isRawKalshiTicker("Will BTC settle above $59,990.31?")).toBe(false);
  });

  it("finds leaks in contaminated text", () => {
    const leaks = findRawTickerLeaksInText(
      "Will BTC settle above $59,990.31? KXBTC15M-26JUN270100-00",
    );
    expect(leaks.length).toBeGreaterThan(0);
    expect(leaks.some((leak) => /KXBTC/i.test(leak))).toBe(true);
  });

  it("returns no leaks for friendly dashboard copy", () => {
    const friendly = [
      "Will BTC settle above $59,990.31 at 12:45 AM?",
      "BTC 15m · Live Kalshi contract",
      "NO TRADE",
      "Decision engine connected",
    ].join(" ");

    expect(findRawTickerLeaksInText(friendly)).toEqual([]);
  });

  it("documents the primary visible-text regression pattern", () => {
    expect(VISIBLE_RAW_TICKER_PATTERN.test("KXBTC15M-26JUN270115-15")).toBe(true);
    expect(VISIBLE_RAW_TICKER_PATTERN.test("BTC 15m · Live Kalshi contract")).toBe(
      false,
    );
  });
});
