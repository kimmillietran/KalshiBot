"use client";

import { useBtcFeedContext } from "../BtcFeedProvider";

/** Rolling BTC chart points derived from live 1m candles + spot ticks. */
export function useBtcChartData() {
  const { chartPoints, price, targetPrice, status, direction } =
    useBtcFeedContext();

  return {
    points: chartPoints,
    currentPrice: price,
    targetPrice,
    status,
    direction,
    isLoading: status === "loading" && chartPoints.length === 0,
  };
}
