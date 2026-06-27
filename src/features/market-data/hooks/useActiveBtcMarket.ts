"use client";

import { useMarketDataContext } from "../MarketDataProvider";

/** Live Kalshi BTC 15m market metadata, countdown, and feed status. */
export function useActiveBtcMarket() {
  const {
    market,
    noMarket,
    feedStatus,
    errorMessage,
    isFallback,
    targetPrice,
    timeRemainingMs,
    lastFetchedAt,
    ticker,
    title,
    timeRemainingFormatted,
    expirationFormatted,
  } = useMarketDataContext();

  return {
    market,
    lifecycle: market?.lifecycle,
    noMarket,
    feedStatus,
    errorMessage,
    isFallback,
    targetPrice,
    timeRemainingMs,
    lastFetchedAt,
    ticker,
    title,
    timeRemainingFormatted,
    expirationFormatted,
    isLoading: feedStatus === "loading",
  };
}
