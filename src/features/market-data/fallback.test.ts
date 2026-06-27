import { describe, expect, it } from "vitest";

import {
  FALLBACK_CONTRACT_PRICING,
  FALLBACK_MARKET_STATUS,
  FALLBACK_MARKET_TICKER,
  FALLBACK_MARKET_TITLE,
  FALLBACK_TARGET_PRICE,
} from "./fallback";

describe("market-data fallback constants", () => {
  it("defines standalone fallback values without mock-data coupling", () => {
    expect(FALLBACK_TARGET_PRICE).toBe(64_225);
    expect(FALLBACK_MARKET_TITLE).toBe("BTC 15m");
    expect(FALLBACK_MARKET_TICKER).toBe("—");
    expect(FALLBACK_MARKET_STATUS).toBe("FALLBACK");
    expect(FALLBACK_CONTRACT_PRICING.isFallback).toBe(true);
    expect(FALLBACK_CONTRACT_PRICING.yes.midCents).toBe(63);
  });
});
