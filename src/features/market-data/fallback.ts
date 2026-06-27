/**
 * Standalone fallback values when Kalshi is unavailable.
 * Intentionally decoupled from trading-dashboard mock data.
 */

import type { MarketContractPricing } from "./types";

/** Display target when live Kalshi strike is unknown or feed is in fallback. */
export const FALLBACK_TARGET_PRICE = 64_225.0;

/** Display market title when Kalshi metadata is unavailable. */
export const FALLBACK_MARKET_TITLE = "BTC 15m";

/** Display ticker when Kalshi metadata is unavailable. */
export const FALLBACK_MARKET_TICKER = "—";

/** Feed status label when using local fallback values. */
export const FALLBACK_MARKET_STATUS = "FALLBACK";

/** Static contract pricing when live Kalshi odds are unavailable. */
export const FALLBACK_CONTRACT_PRICING: MarketContractPricing = {
  yes: {
    bidCents: 62,
    askCents: 64,
    midCents: 63,
    lastCents: 63,
    spreadCents: 2,
  },
  no: {
    bidCents: 36,
    askCents: 38,
    midCents: 38,
    lastCents: null,
    spreadCents: 2,
  },
  volumeLabel: "—",
  liquidityQuality: "Fair",
  updatedAt: new Date(0).toISOString(),
  isFallback: true,
  source: "kalshi",
};
