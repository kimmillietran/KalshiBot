"use client";

import { BtcFeedProvider } from "@/features/btc-feed";
import {
  MarketDataProvider,
  useActiveBtcMarket,
} from "@/features/market-data";

function BtcFeedWithMarketTarget({ children }: { children: React.ReactNode }) {
  const { targetPrice } = useActiveBtcMarket();
  return <BtcFeedProvider targetPrice={targetPrice}>{children}</BtcFeedProvider>;
}

/** Composes live BTC spot feed with Kalshi market metadata for the dashboard. */
export function DashboardProviders({ children }: { children: React.ReactNode }) {
  return (
    <MarketDataProvider>
      <BtcFeedWithMarketTarget>{children}</BtcFeedWithMarketTarget>
    </MarketDataProvider>
  );
}
