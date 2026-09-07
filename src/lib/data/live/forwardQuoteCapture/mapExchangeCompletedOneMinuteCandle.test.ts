import { describe, expect, it } from "vitest";

import { LIVE_CANDLE_CLOSE_OFFSET_MS } from "./btcCandles1mSidecarTypes";
import {
  isClosedMinuteAt,
  mapExchangeCompletedOneMinuteCandle,
} from "./mapExchangeCompletedOneMinuteCandle";

const OPEN_MS = Date.parse("2026-09-07T13:59:00.000Z");

describe("mapExchangeCompletedOneMinuteCandle", () => {
  it("maps Coinbase [time, low, high, open, close, volume] with close = open + 59999", () => {
    const mapped = mapExchangeCompletedOneMinuteCandle([
      OPEN_MS / 1000,
      99_000,
      101_000,
      100_000,
      100_500,
      12.5,
    ]);
    expect(mapped.ok).toBe(true);
    if (!mapped.ok) {
      return;
    }
    expect(mapped.candle.candleOpenTime).toBe("2026-09-07T13:59:00.000Z");
    expect(mapped.candle.candleCloseTime).toBe("2026-09-07T13:59:59.999Z");
    expect(mapped.candle.closeTimeMs - mapped.candle.openTimeMs).toBe(
      LIVE_CANDLE_CLOSE_OFFSET_MS,
    );
    expect(mapped.candle.open).toBe(100_000);
    expect(mapped.candle.high).toBe(101_000);
    expect(mapped.candle.low).toBe(99_000);
    expect(mapped.candle.close).toBe(100_500);
    expect(mapped.candle.volume).toBe(12.5);
  });

  it("rejects malformed tuples", () => {
    expect(mapExchangeCompletedOneMinuteCandle(null).ok).toBe(false);
    expect(mapExchangeCompletedOneMinuteCandle([1, 2, 3]).ok).toBe(false);
    expect(mapExchangeCompletedOneMinuteCandle("x").ok).toBe(false);
  });

  it("rejects non-finite OHLC", () => {
    expect(
      mapExchangeCompletedOneMinuteCandle([OPEN_MS / 1000, 1, 2, Number.NaN, 2, 1]),
    ).toEqual({ ok: false, reason: "non-finite-ohlc" });
  });

  it("rejects invalid OHLC envelopes", () => {
    expect(
      mapExchangeCompletedOneMinuteCandle([OPEN_MS / 1000, 3, 1, 2, 2, 1]),
    ).toEqual({ ok: false, reason: "invalid-ohlc-envelope" });
    expect(
      mapExchangeCompletedOneMinuteCandle([OPEN_MS / 1000, 1, 2, 0, 2, 1]),
    ).toEqual({ ok: false, reason: "invalid-ohlc-envelope" });
  });
});

describe("isClosedMinuteAt", () => {
  const closeMs = OPEN_MS + LIVE_CANDLE_CLOSE_OFFSET_MS;

  it("drops 1ms before close, at close, and accepts 1ms after", () => {
    expect(isClosedMinuteAt(closeMs, closeMs - 1)).toBe(false);
    expect(isClosedMinuteAt(closeMs, closeMs)).toBe(false);
    expect(isClosedMinuteAt(closeMs, closeMs + 1)).toBe(true);
  });
});
