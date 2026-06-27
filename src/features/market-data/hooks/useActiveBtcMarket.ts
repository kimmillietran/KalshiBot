"use client";

import { useMarketDataContext } from "../MarketDataProvider";
import { FALLBACK_CONTRACT_PRICING } from "../fallback";
import { mapPricingToOddsViews } from "../pricing";

/** Live Kalshi BTC 15m market metadata, contract pricing, countdown, and feed status. */
export function useActiveBtcMarket() {
  const {
    market,
    pricing,
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
    pricingIsStale,
  } = useMarketDataContext();

  const effectivePricing = pricing ?? (isFallback ? FALLBACK_CONTRACT_PRICING : null);
  const contractOdds = effectivePricing
    ? mapPricingToOddsViews(effectivePricing)
    : null;

  return {
    market,
    lifecycle: market?.lifecycle,
    pricing: effectivePricing,
    contractOdds,
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
    pricingIsStale,
    isLoading: feedStatus === "loading",
  };
}
