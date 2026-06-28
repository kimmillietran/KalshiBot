"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { queryKeys } from "@/lib/query";

import { fetchActiveBtcMarket } from "./api/kalshiClient";
import {
  COUNTDOWN_TICK_MS,
  MARKET_POLL_MS,
  MARKET_STALE_THRESHOLD_MS,
} from "./constants";
import { useOrderbookFeed } from "./hooks/useOrderbookFeed";
import {
  FALLBACK_CONTRACT_PRICING,
  FALLBACK_MARKET_TICKER,
  FALLBACK_MARKET_TITLE,
  FALLBACK_TARGET_PRICE,
} from "./fallback";
import type {
  ActiveBtcMarket,
  ActiveBtcMarketApiResponse,
  MarketContractPricing,
  MarketDataState,
  MarketDataStatus,
} from "./types";
import {
  computeTimeRemainingMs,
  formatCountdown,
  formatExpirationTime,
  isMarketFeedStale,
} from "./utils";

type MarketDataContextValue = MarketDataState & {
  ticker: string;
  title: string;
  timeRemainingFormatted: string;
  expirationFormatted: string;
  pricingIsStale: boolean;
};

const MarketDataContext = createContext<MarketDataContextValue | null>(null);

type DerivedSnapshot = {
  market: ActiveBtcMarket | null;
  pricing: MarketContractPricing | null;
  noMarket: boolean;
  feedStatus: MarketDataStatus;
  errorMessage: string | null;
  isFallback: boolean;
  lastFetchedAt: Date | null;
  closeTime: string | null;
};

function loadingSnapshot(): DerivedSnapshot {
  return {
    market: null,
    pricing: null,
    noMarket: false,
    feedStatus: "loading",
    errorMessage: null,
    isFallback: false,
    lastFetchedAt: null,
    closeTime: null,
  };
}

function deriveSnapshot(
  nowMs: number,
  data: ActiveBtcMarketApiResponse | undefined,
  dataUpdatedAt: number,
  isError: boolean,
  error: unknown,
  isPending: boolean,
): DerivedSnapshot {
  if (isError && error) {
    const hadPriorData = Boolean(data?.market && !data.noMarket);
    const message =
      error instanceof Error ? error.message : "Kalshi market unavailable";

    return {
      market: null,
      pricing: FALLBACK_CONTRACT_PRICING,
      noMarket: false,
      feedStatus: hadPriorData ? "stale" : "fallback",
      errorMessage: message,
      isFallback: true,
      lastFetchedAt: null,
      closeTime: null,
    };
  }

  if (data) {
    const lastFetchedAt = new Date(dataUpdatedAt);

    if (data.noMarket || !data.market) {
      return {
        market: null,
        pricing: null,
        noMarket: true,
        feedStatus: "no-market",
        errorMessage: data.message ?? null,
        isFallback: false,
        lastFetchedAt,
        closeTime: null,
      };
    }

    let feedStatus: MarketDataStatus = "live";
    if (
      isMarketFeedStale(lastFetchedAt, nowMs, MARKET_STALE_THRESHOLD_MS)
    ) {
      feedStatus = "stale";
    }

    return {
      market: data.market,
      pricing: data.pricing,
      noMarket: false,
      feedStatus,
      errorMessage: null,
      isFallback: false,
      lastFetchedAt,
      closeTime: data.market.closeTime,
    };
  }

  if (isPending) {
    return loadingSnapshot();
  }

  return loadingSnapshot();
}

export function MarketDataProvider({ children }: { children: React.ReactNode }) {
  const [nowMs, setNowMs] = useState(() => Date.now());
  const refreshRequestedRef = useRef(false);

  const marketQuery = useQuery({
    queryKey: queryKeys.kalshi.activeBtcMarket(),
    queryFn: fetchActiveBtcMarket,
    refetchInterval: MARKET_POLL_MS,
    staleTime: MARKET_POLL_MS / 2,
    placeholderData: keepPreviousData,
  });

  const { refetch: refetchMarket } = marketQuery;

  useEffect(() => {
    const interval = setInterval(() => {
      setNowMs(Date.now());
    }, COUNTDOWN_TICK_MS);

    return () => clearInterval(interval);
  }, []);

  const closeTime = marketQuery.data?.market?.closeTime ?? null;

  useEffect(() => {
    if (!closeTime) return;

    if (
      computeTimeRemainingMs(closeTime) <= 0 &&
      !refreshRequestedRef.current
    ) {
      refreshRequestedRef.current = true;
      void refetchMarket().finally(() => {
        refreshRequestedRef.current = false;
      });
    }
  }, [closeTime, nowMs, refetchMarket]);

  const snapshot = deriveSnapshot(
    nowMs,
    marketQuery.data,
    marketQuery.dataUpdatedAt,
    marketQuery.isError,
    marketQuery.error,
    marketQuery.isPending,
  );

  const orderbookFeed = useOrderbookFeed(snapshot.market?.ticker ?? null);

  const effectivePricing = orderbookFeed.pricing ?? snapshot.pricing;
  const pricingIsStale =
    orderbookFeed.status === "stale" ||
    orderbookFeed.status === "error" ||
    snapshot.feedStatus === "stale";

  const targetPrice = useMemo(() => {
    if (snapshot.market?.targetPrice != null) return snapshot.market.targetPrice;
    return FALLBACK_TARGET_PRICE;
  }, [snapshot.market?.targetPrice]);

  const ticker = snapshot.market?.ticker ?? FALLBACK_MARKET_TICKER;
  const title = snapshot.noMarket
    ? "No Active Market"
    : snapshot.market?.title ?? FALLBACK_MARKET_TITLE;

  const timeRemainingMs = snapshot.closeTime
    ? computeTimeRemainingMs(snapshot.closeTime)
    : 0;

  const value = useMemo<MarketDataContextValue>(
    () => ({
      market: snapshot.market,
      pricing: effectivePricing,
      noMarket: snapshot.noMarket,
      feedStatus: snapshot.feedStatus,
      errorMessage: snapshot.errorMessage ?? orderbookFeed.errorMessage,
      isFallback: snapshot.isFallback,
      targetPrice,
      timeRemainingMs,
      lastFetchedAt: snapshot.lastFetchedAt,
      ticker,
      title,
      pricingIsStale,
      timeRemainingFormatted: formatCountdown(timeRemainingMs),
      expirationFormatted: formatExpirationTime(snapshot.market?.closeTime ?? null),
    }),
    [
      snapshot,
      effectivePricing,
      orderbookFeed.errorMessage,
      targetPrice,
      timeRemainingMs,
      ticker,
      title,
      pricingIsStale,
    ],
  );

  return (
    <MarketDataContext.Provider value={value}>{children}</MarketDataContext.Provider>
  );
}

export function useMarketDataContext(): MarketDataContextValue {
  const ctx = useContext(MarketDataContext);
  if (!ctx) {
    throw new Error("useMarketDataContext must be used within MarketDataProvider");
  }
  return ctx;
}
