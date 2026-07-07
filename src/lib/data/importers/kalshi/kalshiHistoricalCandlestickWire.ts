import type { HistoricalCandlestickRecord } from "./kalshiHistoricalTypes";

export type KalshiHistoricalCandlestickWireShape = {
  end_period_ts: number;
  volume: string;
  open_interest: string;
  price?: { close?: string | null };
};

/** Returns a non-empty trade close when the historical candlestick wire exposes one. */
export function resolveKalshiHistoricalCandlestickPriceClose(
  wire: Pick<KalshiHistoricalCandlestickWireShape, "price">,
): string | null {
  const close = wire.price?.close;
  if (typeof close !== "string") {
    return null;
  }

  const trimmed = close.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** Returns true when a parsed historical candlestick record has a usable trade close. */
export function hasRecoverableKalshiHistoricalCandlestickPrice(
  candle: Pick<HistoricalCandlestickRecord, "priceClose">,
): boolean {
  if (candle.priceClose === null) {
    return false;
  }

  return candle.priceClose.trim().length > 0;
}

/**
 * Builds a JSON-safe historical candlestick wire payload.
 * Omits `price` entirely when trade close is unavailable (never `price: undefined`).
 */
export function buildKalshiHistoricalCandlestickWire(
  candle: Pick<
    HistoricalCandlestickRecord,
    "endPeriodTs" | "volume" | "openInterest" | "priceClose"
  >,
): KalshiHistoricalCandlestickWireShape {
  if (!Number.isFinite(candle.endPeriodTs)) {
    throw new Error("Kalshi historical candlestick response is missing end_period_ts");
  }

  const wire: KalshiHistoricalCandlestickWireShape = {
    end_period_ts: candle.endPeriodTs,
    volume: candle.volume,
    open_interest: candle.openInterest,
  };

  const priceClose = candle.priceClose?.trim();
  if (priceClose) {
    wire.price = { close: priceClose };
  }

  return wire;
}

/** Formats a skip diagnostic for candlesticks missing recoverable trade close. */
export function formatKalshiHistoricalCandlestickMissingPriceDiagnostic(input: {
  ticker: string;
  endPeriodTs: number;
}): string {
  const eventTime = new Date(input.endPeriodTs * 1000).toISOString();
  return `Kalshi historical candlestick for ${input.ticker} at ${eventTime} is missing price.close`;
}
