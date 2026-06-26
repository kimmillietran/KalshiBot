import { tradingMockData } from "@/features/mock-data";

/** Poll live BTC spot price every 4 seconds. */
export const BTC_PRICE_POLL_MS = 4_000;

/** Refresh 1-minute candle history every 60 seconds. */
export const BTC_CANDLES_POLL_MS = 60_000;

/** Mark feed stale if no successful update within 15 seconds. */
export const BTC_STALE_THRESHOLD_MS = 15_000;

/** Brief flash duration after a price tick (ms). */
export const PRICE_FLASH_MS = 600;

/** Mock Kalshi target — remains static until Kalshi integration. */
export const MOCK_TARGET_PRICE = tradingMockData.market.targetPrice;

/** Fallback spot price when live feed is unavailable. */
export const FALLBACK_BTC_PRICE = tradingMockData.commandBar.btcPrice;

export const FALLBACK_CHANGE_24H_PCT = tradingMockData.commandBar.change24hPercent;
