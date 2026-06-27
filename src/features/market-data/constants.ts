/** Kalshi production REST base (server-side only). */
export const KALSHI_API_BASE =
  "https://external-api.kalshi.com/trade-api/v2";

/** BTC 15-minute recurring series on Kalshi. */
export const BTC_15M_SERIES_TICKER = "KXBTC15M";

/** Poll active market metadata every 12 seconds (within 10–15s guidance). */
export const MARKET_POLL_MS = 12_000;

/** Local countdown tick interval — does not hit the network. */
export const COUNTDOWN_TICK_MS = 1_000;

/** Mark market feed stale after 30s without a successful BFF response. */
export const MARKET_STALE_THRESHOLD_MS = 30_000;

/** Upstream Kalshi HTTP request timeout (AbortSignal). */
export const MARKET_API_TIMEOUT_MS = 5_000;
