/** Kalshi production WebSocket endpoint (trade API v2). */
export const KALSHI_WS_URL =
  "wss://external-api-ws.kalshi.com/trade-api/ws/v2";

/** Mark orderbook feed stale when no snapshot/delta received within this window. */
export const ORDERBOOK_STALE_THRESHOLD_MS = 30_000;

/** Initial reconnect delay after an unexpected socket close. */
export const ORDERBOOK_RECONNECT_BASE_MS = 1_000;

/** Maximum reconnect backoff delay. */
export const ORDERBOOK_RECONNECT_MAX_MS = 30_000;

/** Subscription command id seed for deterministic client-side ids. */
export const ORDERBOOK_SUBSCRIPTION_ID_START = 1;
