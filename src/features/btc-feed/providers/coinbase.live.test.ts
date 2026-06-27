import { describe, expect, it } from "vitest";

import { createCoinbaseBtcProvider } from "./coinbase";
import { parseCoinbaseCandlesJson } from "./coinbaseCandles";

/**
 * Smoke test against live Coinbase Exchange API.
 * Confirms production JSON shape uses numeric OHLCV (not strings).
 */
describe("Coinbase live API smoke", () => {
  it("parses live candle rows with numeric OHLCV", async () => {
    const provider = createCoinbaseBtcProvider();
    const candles = await provider.getCandles("1m", 5);

    expect(candles.length).toBeGreaterThanOrEqual(1);
    expect(typeof candles[0].open).toBe("number");
    expect(typeof candles[0].close).toBe("number");
    expect(candles[0].high).toBeGreaterThan(0);
  }, 15_000);

  it("parses a fetched live payload through parseCoinbaseCandlesJson", async () => {
    const res = await fetch(
      "https://api.exchange.coinbase.com/products/BTC-USD/candles?granularity=60&limit=2",
    );
    const json: unknown = await res.json();

    const rows = parseCoinbaseCandlesJson(json);
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(typeof rows[0][1]).toBe("number");
  }, 15_000);
});
