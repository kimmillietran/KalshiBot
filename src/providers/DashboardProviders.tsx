"use client";

import type { QueryClient } from "@tanstack/react-query";

import { BtcFeedProvider } from "@/features/btc-feed";
import {
  MarketDataProvider,
  useActiveBtcMarket,
} from "@/features/market-data";

import { QueryProvider } from "./QueryProvider";

function BtcFeedWithMarketTarget({ children }: { children: React.ReactNode }) {
  const { targetPrice } = useActiveBtcMarket();
  return <BtcFeedProvider targetPrice={targetPrice}>{children}</BtcFeedProvider>;
}

/** Composes live BTC spot feed with Kalshi market metadata for the dashboard. */
export function DashboardProviders({
  children,
  queryClient,
}: {
  children: React.ReactNode;
  queryClient?: QueryClient;
}) {
  return (
    <QueryProvider client={queryClient}>
      <MarketDataProvider>
        <BtcFeedWithMarketTarget>{children}</BtcFeedWithMarketTarget>
      </MarketDataProvider>
    </QueryProvider>
  );
}
