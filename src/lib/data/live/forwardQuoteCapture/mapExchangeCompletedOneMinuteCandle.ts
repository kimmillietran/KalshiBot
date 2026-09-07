import {
  LIVE_CANDLE_CLOSE_OFFSET_MS,
  LIVE_CANDLE_GRANULARITY_MS,
} from "./btcCandles1mSidecarTypes";

export type MappedExchangeOneMinuteCandle = {
  openTimeMs: number;
  closeTimeMs: number;
  candleOpenTime: string;
  candleCloseTime: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type MapExchangeCandleResult =
  | { ok: true; candle: MappedExchangeOneMinuteCandle }
  | { ok: false; reason: "malformed-tuple" | "non-finite-ohlc" | "invalid-ohlc-envelope" };

function readFiniteNumber(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }
  return value;
}

function readOpenTimeMs(value: unknown): number | null {
  const seconds = readFiniteNumber(value);
  if (seconds === null || seconds <= 0) {
    return null;
  }
  return Math.round(seconds) * 1_000;
}

function isoUtc(ms: number): string {
  return new Date(ms).toISOString();
}

/**
 * Maps one Coinbase Exchange REST candle tuple
 * `[time_seconds, low, high, open, close, volume]` to the 1m close identity
 * used by the v2 evaluator: close = open + 59_999 ms.
 */
export function mapExchangeCompletedOneMinuteCandle(
  row: unknown,
): MapExchangeCandleResult {
  if (!Array.isArray(row) || row.length < 6) {
    return { ok: false, reason: "malformed-tuple" };
  }

  const openTimeMs = readOpenTimeMs(row[0]);
  const low = readFiniteNumber(row[1]);
  const high = readFiniteNumber(row[2]);
  const open = readFiniteNumber(row[3]);
  const close = readFiniteNumber(row[4]);
  const volume = readFiniteNumber(row[5]);

  if (
    openTimeMs === null
    || low === null
    || high === null
    || open === null
    || close === null
    || volume === null
  ) {
    return { ok: false, reason: "non-finite-ohlc" };
  }

  if (open <= 0 || high <= 0 || low <= 0 || close <= 0 || volume < 0) {
    return { ok: false, reason: "invalid-ohlc-envelope" };
  }

  if (high < low || high < open || high < close || low > open || low > close) {
    return { ok: false, reason: "invalid-ohlc-envelope" };
  }

  const closeTimeMs = openTimeMs + LIVE_CANDLE_CLOSE_OFFSET_MS;
  if (closeTimeMs - openTimeMs !== LIVE_CANDLE_CLOSE_OFFSET_MS) {
    return { ok: false, reason: "malformed-tuple" };
  }
  if (LIVE_CANDLE_GRANULARITY_MS !== 60_000) {
    return { ok: false, reason: "malformed-tuple" };
  }

  return {
    ok: true,
    candle: {
      openTimeMs,
      closeTimeMs,
      candleOpenTime: isoUtc(openTimeMs),
      candleCloseTime: isoUtc(closeTimeMs),
      open,
      high,
      low,
      close,
      volume,
    },
  };
}

export function isClosedMinuteAt(closeTimeMs: number, nowMs: number): boolean {
  return closeTimeMs < nowMs;
}
