import { describe, expect, it } from "vitest";

import { BtcProviderMalformedResponseError } from "./errors";
import {
  mapCoinbaseCandleRows,
  parseCoinbaseCandlesJson,
} from "./coinbaseCandles";
import { coinbaseCandlesFixture } from "./fixtures/coinbaseCandles.fixture";

describe("parseCoinbaseCandlesJson", () => {
  it("parses real-shaped numeric Coinbase candle arrays", () => {
    const rows = parseCoinbaseCandlesJson([...coinbaseCandlesFixture]);

    expect(rows).toHaveLength(3);
    expect(rows[0][1]).toBe(64170.12);
    expect(rows[1][4]).toBe(64250.32);
  });

  it("throws when payload is not an array", async () => {
    await expect(() => parseCoinbaseCandlesJson({ candles: [] })).toThrow(
      BtcProviderMalformedResponseError,
    );
    await expect(() => parseCoinbaseCandlesJson({ candles: [] })).toThrow(
      /payload is not an array/i,
    );
  });

  it("throws when a candle row is not an array", () => {
    expect(() =>
      parseCoinbaseCandlesJson([
        [1719421200, 64170.12, 64200.55, 64180.0, 64190.25, 12.5],
        "bad-row",
      ]),
    ).toThrow(/row 1 is not an array/i);
  });

  it("throws when a candle row has invalid length", () => {
    expect(() =>
      parseCoinbaseCandlesJson([[1719421200, 64170.12, 64200.55]]),
    ).toThrow(/row 0 has invalid length/i);
  });

  it("throws when OHLC fields are not numeric", () => {
    expect(() =>
      parseCoinbaseCandlesJson([
        [1719421200, "64170.12", 64200.55, 64180.0, 64190.25, 12.5],
      ]),
    ).toThrow(/row 0: low is not a valid number/i);
  });

  it("throws when numeric fields are NaN", () => {
    expect(() =>
      parseCoinbaseCandlesJson([
        [1719421200, Number.NaN, 64200.55, 64180.0, 64190.25, 12.5],
      ]),
    ).toThrow(/row 0: low is not a valid number/i);
  });
});

describe("mapCoinbaseCandleRows", () => {
  it("maps validated rows to ascending domain candles", () => {
    const rows = parseCoinbaseCandlesJson([...coinbaseCandlesFixture]);
    const candles = mapCoinbaseCandleRows(rows);

    expect(candles[0].timestamp).toBeLessThan(candles[1].timestamp);
    expect(candles[0].open).toBe(64180.0);
    expect(candles[0].low).toBe(64170.12);
    expect(candles[0].high).toBe(64200.55);
    expect(candles[0].close).toBe(64190.25);
    expect(candles[2].close).toBe(64295.5);
  });
});
