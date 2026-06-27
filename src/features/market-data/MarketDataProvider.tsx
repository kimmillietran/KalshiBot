"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

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
  const mountedRef = useRef(true);
  const refreshRequestedRef = useRef(false);

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

  const loadMarket = useCallback(async () => {
    try {
      const data = await fetchActiveBtcMarket();
      if (!mountedRef.current) return;

      if (data.noMarket || !data.market) {
        applyNoMarket(data.message);
        return;
      }

      applyMarket(data.market);
    } catch (err) {
      if (!mountedRef.current) return;
      const message =
        err instanceof Error ? err.message : "Kalshi market unavailable";
      applyFallback(message);
    } finally {
      refreshRequestedRef.current = false;
    }
  }, [applyFallback, applyMarket, applyNoMarket]);

  useEffect(() => {
    mountedRef.current = true;

    const bootTimer = setTimeout(() => {
      void loadMarket();
    }, 0);

    const pollInterval = setInterval(() => void loadMarket(), MARKET_POLL_MS);

    const countdownInterval = setInterval(() => {
      const closeTime = closeTimeRef.current;
      if (!closeTime) return;

      const remaining = computeTimeRemainingMs(closeTime);
      setTimeRemainingMs(remaining);

      if (remaining <= 0 && !refreshRequestedRef.current) {
        refreshRequestedRef.current = true;
        void loadMarket();
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
      mountedRef.current = false;
      clearTimeout(bootTimer);
      clearInterval(pollInterval);
      clearInterval(countdownInterval);
      clearInterval(staleInterval);
    };
  }, [loadMarket]);

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
