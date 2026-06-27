"use client";

import { useQuery } from "@tanstack/react-query";
import {
  createContext,
  useCallback,
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
import {
  FALLBACK_MARKET_TICKER,
  FALLBACK_MARKET_TITLE,
  FALLBACK_TARGET_PRICE,
} from "./fallback";
import type {
  ActiveBtcMarket,
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
};

const MarketDataContext = createContext<MarketDataContextValue | null>(null);

export function MarketDataProvider({ children }: { children: React.ReactNode }) {
  const [market, setMarket] = useState<ActiveBtcMarket | null>(null);
  const [noMarket, setNoMarket] = useState(false);
  const [feedStatus, setFeedStatus] = useState<MarketDataStatus>("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isFallback, setIsFallback] = useState(false);
  const [timeRemainingMs, setTimeRemainingMs] = useState(0);
  const [lastFetchedAt, setLastFetchedAt] = useState<Date | null>(null);

  const hasLiveDataRef = useRef(false);
  const closeTimeRef = useRef<string | null>(null);
  const lastFetchedAtRef = useRef<Date | null>(null);
  const isFallbackRef = useRef(false);
  const refreshRequestedRef = useRef(false);

  const marketQuery = useQuery({
    queryKey: queryKeys.kalshi.activeBtcMarket(),
    queryFn: fetchActiveBtcMarket,
    refetchInterval: MARKET_POLL_MS,
    staleTime: MARKET_POLL_MS / 2,
  });

  const { refetch: refetchMarket } = marketQuery;

  const applyFallback = useCallback((message: string) => {
    setErrorMessage(message);
    setIsFallback(true);
    isFallbackRef.current = true;
    setNoMarket(false);
    setMarket(null);
    closeTimeRef.current = null;
    setTimeRemainingMs(0);

    if (!hasLiveDataRef.current) {
      setFeedStatus("fallback");
      return;
    }

    setFeedStatus("stale");
  }, []);

  const applyMarket = useCallback((next: ActiveBtcMarket) => {
    setMarket(next);
    setNoMarket(false);
    setIsFallback(false);
    isFallbackRef.current = false;
    setErrorMessage(null);
    hasLiveDataRef.current = true;
    setFeedStatus("live");
    const fetchedAt = new Date();
    setLastFetchedAt(fetchedAt);
    lastFetchedAtRef.current = fetchedAt;
    closeTimeRef.current = next.closeTime;
    setTimeRemainingMs(computeTimeRemainingMs(next.closeTime));
  }, []);

  const applyNoMarket = useCallback((message?: string) => {
    setMarket(null);
    setNoMarket(true);
    setIsFallback(false);
    isFallbackRef.current = false;
    setErrorMessage(message ?? null);
    closeTimeRef.current = null;
    setTimeRemainingMs(0);
    hasLiveDataRef.current = true;
    setFeedStatus("no-market");
    const fetchedAt = new Date();
    setLastFetchedAt(fetchedAt);
    lastFetchedAtRef.current = fetchedAt;
  }, []);

  // Bridge TanStack Query results into context state for stable public hooks.
  /* eslint-disable react-hooks/set-state-in-effect -- preserves useActiveBtcMarket API during migration */
  useEffect(() => {
    if (marketQuery.isSuccess && marketQuery.data) {
      if (marketQuery.data.noMarket || !marketQuery.data.market) {
        applyNoMarket(marketQuery.data.message);
      } else {
        applyMarket(marketQuery.data.market);
      }
      refreshRequestedRef.current = false;
      return;
    }

    if (marketQuery.isError && marketQuery.error) {
      const message =
        marketQuery.error instanceof Error
          ? marketQuery.error.message
          : "Kalshi market unavailable";
      applyFallback(message);
      refreshRequestedRef.current = false;
    }
  }, [
    applyFallback,
    applyMarket,
    applyNoMarket,
    marketQuery.data,
    marketQuery.error,
    marketQuery.isError,
    marketQuery.isSuccess,
  ]);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    const countdownInterval = setInterval(() => {
      const closeTime = closeTimeRef.current;
      if (!closeTime) return;

      const remaining = computeTimeRemainingMs(closeTime);
      setTimeRemainingMs(remaining);

      if (remaining <= 0 && !refreshRequestedRef.current) {
        refreshRequestedRef.current = true;
        void refetchMarket();
      }
    }, COUNTDOWN_TICK_MS);

    const staleInterval = setInterval(() => {
      if (!lastFetchedAtRef.current || !hasLiveDataRef.current || isFallbackRef.current) {
        return;
      }
      if (
        isMarketFeedStale(
          lastFetchedAtRef.current,
          Date.now(),
          MARKET_STALE_THRESHOLD_MS,
        )
      ) {
        setFeedStatus((current) => (current === "live" ? "stale" : current));
      }
    }, COUNTDOWN_TICK_MS);

    return () => {
      clearInterval(countdownInterval);
      clearInterval(staleInterval);
    };
  }, [refetchMarket]);

  const targetPrice = useMemo(() => {
    if (market?.targetPrice != null) return market.targetPrice;
    return FALLBACK_TARGET_PRICE;
  }, [market?.targetPrice]);

  const ticker = market?.ticker ?? FALLBACK_MARKET_TICKER;
  const title = noMarket
    ? "No Active Market"
    : market?.title ?? FALLBACK_MARKET_TITLE;

  const value = useMemo<MarketDataContextValue>(
    () => ({
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
      timeRemainingFormatted: formatCountdown(timeRemainingMs),
      expirationFormatted: formatExpirationTime(market?.closeTime ?? null),
    }),
    [
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
