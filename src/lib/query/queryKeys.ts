/** Centralized TanStack Query keys for server-state caches. */
export const queryKeys = {
  btc: {
    all: ["btc"] as const,
    price: () => [...queryKeys.btc.all, "price"] as const,
    candles: () => [...queryKeys.btc.all, "candles"] as const,
  },
  kalshi: {
    all: ["kalshi"] as const,
    activeBtcMarket: () => [...queryKeys.kalshi.all, "active-btc-market"] as const,
  },
} as const;
