import { describe, expect, it } from "vitest";

import { FALLBACK_BTC_PRICE } from "../constants";
import { createFallbackBtcPriceProvider } from "./fallback";

describe("createFallbackBtcPriceProvider", () => {
  it("returns mock constants for price and candles", async () => {
    const provider = createFallbackBtcPriceProvider();

    const price = await provider.getCurrentPrice();
    expect(price.price).toBe(FALLBACK_BTC_PRICE);

    const candles = await provider.getCandles("1m", 5);
    expect(candles).toHaveLength(5);
    expect(candles[0].close).toBe(FALLBACK_BTC_PRICE);
  });
});
