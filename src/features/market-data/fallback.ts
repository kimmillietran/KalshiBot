/**
 * Standalone fallback values when Kalshi is unavailable.
 * Intentionally decoupled from trading-dashboard mock data.
 */

/** Display target when live Kalshi strike is unknown or feed is in fallback. */
export const FALLBACK_TARGET_PRICE = 64_225.0;

/** Display market title when Kalshi metadata is unavailable. */
export const FALLBACK_MARKET_TITLE = "BTC 15m";

/** Display ticker when Kalshi metadata is unavailable. */
export const FALLBACK_MARKET_TICKER = "—";

/** Feed status label when using local fallback values. */
export const FALLBACK_MARKET_STATUS = "FALLBACK";
