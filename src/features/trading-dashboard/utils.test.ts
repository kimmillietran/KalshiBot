import { describe, expect, it } from "vitest";

import {
  formatMarketContractQuestion,
  formatMarketDisplayName,
  formatMarketSubtitle,
  isRawKalshiTicker,
} from "./utils";

describe("formatMarketContractQuestion", () => {
  it("formats live contract question with target and expiration", () => {
    expect(formatMarketContractQuestion(64_225, "12:45 PM")).toBe(
      "Will BTC settle above $64,225.00 at 12:45 PM?",
    );
  });

  it("omits expiration clause when unknown", () => {
    expect(formatMarketContractQuestion(64_225, "—")).toBe(
      "Will BTC settle above $64,225.00?",
    );
  });

  it("handles no active market", () => {
    expect(
      formatMarketContractQuestion(64_225, "12:45 PM", { noMarket: true }),
    ).toBe("No active Kalshi BTC contract");
  });
});

describe("formatMarketSubtitle", () => {
  it("returns friendly subtitle instead of raw ticker", () => {
    expect(formatMarketSubtitle("KXBTC15M-26JUN270100-00")).toBe(
      "BTC 15m · Live Kalshi contract",
    );
    expect(formatMarketDisplayName("KXBTC15M-26JUN270100-00")).toBe(
      "BTC 15m · Live Kalshi contract",
    );
    expect(isRawKalshiTicker("KXBTC15M-26JUN270100-00")).toBe(true);
  });

  it("handles no active market", () => {
    expect(formatMarketSubtitle(null, { noMarket: true })).toBe(
      "BTC 15m · No active contract",
    );
  });
});
