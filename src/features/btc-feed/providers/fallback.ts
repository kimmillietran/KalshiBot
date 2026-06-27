import {
  BTC_CANDLES_LIMIT,
  FALLBACK_BTC_PRICE,
  FALLBACK_CHANGE_24H_PCT,
} from "../constants";
import type {
  BtcCandleInterval,
  BtcPriceProvider,
  BtcProviderCandle,
  BtcProviderPrice,
} from "./interface";

function formatCandleTime(timestampMs: number): string {
  return new Date(timestampMs).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function buildFallbackCandles(limit: number): BtcProviderCandle[] {
  const now = Date.now();
  const minuteMs = 60_000;
  const count = Math.min(limit, BTC_CANDLES_LIMIT);

  return Array.from({ length: count }, (_, index) => {
    const offset = count - index - 1;
    const timestamp = now - offset * minuteMs;
    const close = FALLBACK_BTC_PRICE;
    return {
      timestamp,
      time: formatCandleTime(timestamp),
      open: close,
      high: close,
      low: close,
      close,
    };
  });
}

/** Last-resort provider using dashboard mock constants. */
export function createFallbackBtcPriceProvider(): BtcPriceProvider {
  return {
    id: "fallback",

    async getCurrentPrice(): Promise<BtcProviderPrice> {
      const change24h = (FALLBACK_BTC_PRICE * FALLBACK_CHANGE_24H_PCT) / 100;
      return {
        price: FALLBACK_BTC_PRICE,
        change24h,
        change24hPercent: FALLBACK_CHANGE_24H_PCT,
        updatedAt: new Date().toISOString(),
      };
    },

    async getCandles(
      _interval: BtcCandleInterval,
      limit: number,
    ): Promise<BtcProviderCandle[]> {
      return buildFallbackCandles(limit);
    },
  };
}
