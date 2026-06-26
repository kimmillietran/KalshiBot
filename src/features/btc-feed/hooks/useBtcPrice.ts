"use client";

import { useBtcFeedContext } from "../BtcFeedProvider";

/** Live BTC spot price, 24h change, feed status, and tick direction. */
export function useBtcPrice() {
  const {
    price,
    change24h,
    change24hPercent,
    lastUpdated,
    status,
    direction,
    errorMessage,
    isUsingFallback,
    targetPrice,
    distanceFromTarget,
    distancePercent,
    isAboveTarget,
  } = useBtcFeedContext();

  return {
    price,
    change24h,
    change24hPercent,
    lastUpdated,
    status,
    direction,
    errorMessage,
    isUsingFallback,
    targetPrice,
    distanceFromTarget,
    distancePercent,
    isAboveTarget,
  };
}
