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

import { fetchBtcCandles, fetchBtcPrice } from "./api/btcClient";
import {
  BTC_CANDLES_POLL_MS,
  BTC_PRICE_POLL_MS,
  FALLBACK_BTC_PRICE,
  FALLBACK_CHANGE_24H_PCT,
  MOCK_TARGET_PRICE,
  PRICE_FLASH_MS,
} from "./constants";
import type { BtcFeedState, BtcFeedStatus, PriceDirection } from "./types";
import {
  calculateDistanceFromTarget,
  calculatePriceChangeDirection,
  candlesToChartPoints,
  isFeedStale,
  mergeLivePriceIntoChart,
} from "./utils";

type BtcFeedContextValue = BtcFeedState;

const BtcFeedContext = createContext<BtcFeedContextValue | null>(null);

function buildDistance(price: number, targetPrice: number) {
  const { distance, percent } = calculateDistanceFromTarget(
    price,
    targetPrice,
  );
  return {
    distanceFromTarget: distance,
    distancePercent: percent,
    isAboveTarget: distance >= 0,
  };
}

type BtcFeedProviderProps = {
  children: React.ReactNode;
  targetPrice?: number;
};

export function BtcFeedProvider({
  children,
  targetPrice = MOCK_TARGET_PRICE,
}: BtcFeedProviderProps) {
  const [price, setPrice] = useState(FALLBACK_BTC_PRICE);
  const [change24h, setChange24h] = useState(0);
  const [change24hPercent, setChange24hPercent] = useState(FALLBACK_CHANGE_24H_PCT);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [chartPoints, setChartPoints] = useState<
    { time: string; price: number }[]
  >([]);
  const [status, setStatus] = useState<BtcFeedStatus>("loading");
  const [direction, setDirection] = useState<PriceDirection>("flat");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isUsingFallback, setIsUsingFallback] = useState(true);

  const previousPriceRef = useRef<number | null>(null);
  const hasLiveDataRef = useRef(false);
  const lastUpdatedRef = useRef<Date | null>(null);
  const flashTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  const applyPrice = useCallback(
    (nextPrice: number, nextChange24h: number, nextChangePct: number) => {
      const dir = calculatePriceChangeDirection(
        previousPriceRef.current,
        nextPrice,
      );
      previousPriceRef.current = nextPrice;

      const now = new Date();
      lastUpdatedRef.current = now;

      setPrice(nextPrice);
      setChange24h(nextChange24h);
      setChange24hPercent(nextChangePct);
      setLastUpdated(now);
      setIsUsingFallback(false);
      setErrorMessage(null);
      hasLiveDataRef.current = true;
      setStatus("live");

      if (dir !== "flat") {
        setDirection(dir);
        if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current);
        flashTimeoutRef.current = setTimeout(() => {
          if (mountedRef.current) setDirection("flat");
        }, PRICE_FLASH_MS);
      }

      setChartPoints((prev) => mergeLivePriceIntoChart(prev, nextPrice));
    },
    [],
  );

  const loadPrice = useCallback(async () => {
    try {
      const data = await fetchBtcPrice();
      if (!mountedRef.current) return;
      applyPrice(data.price, data.change24h, data.change24hPercent);
    } catch (err) {
      if (!mountedRef.current) return;
      const message =
        err instanceof Error ? err.message : "BTC feed unavailable";
      setErrorMessage(message);

      if (!hasLiveDataRef.current) {
        setIsUsingFallback(true);
        setStatus("fallback");
      } else {
        setStatus("stale");
      }
    }
  }, [applyPrice]);

  const loadCandles = useCallback(async () => {
    try {
      const { candles } = await fetchBtcCandles();
      if (!mountedRef.current) return;
      const points = candlesToChartPoints(candles);
      setChartPoints((prev) => {
        const livePrice = prev.length > 0 ? prev[prev.length - 1].price : points.at(-1)?.price;
        if (livePrice !== undefined) {
          return mergeLivePriceIntoChart(points, livePrice);
        }
        return points;
      });
    } catch {
      // Candles are supplementary; price polling handles primary errors.
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;

    const bootTimer = setTimeout(() => {
      void loadCandles();
      void loadPrice();
    }, 0);

    const priceInterval = setInterval(() => void loadPrice(), BTC_PRICE_POLL_MS);
    const candleInterval = setInterval(
      () => void loadCandles(),
      BTC_CANDLES_POLL_MS,
    );

    const staleInterval = setInterval(() => {
      if (!lastUpdatedRef.current || !hasLiveDataRef.current) return;
      if (isFeedStale(lastUpdatedRef.current)) {
        setStatus("stale");
      }
    }, 1_000);

    return () => {
      mountedRef.current = false;
      clearTimeout(bootTimer);
      clearInterval(priceInterval);
      clearInterval(candleInterval);
      clearInterval(staleInterval);
      if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current);
    };
  }, [loadCandles, loadPrice]);

  const distance = useMemo(
    () => buildDistance(price, targetPrice),
    [price, targetPrice],
  );

  const value = useMemo<BtcFeedContextValue>(
    () => ({
      price,
      change24h,
      change24hPercent,
      lastUpdated,
      chartPoints,
      status,
      direction,
      errorMessage,
      isUsingFallback,
      targetPrice,
      ...distance,
    }),
    [
      price,
      change24h,
      change24hPercent,
      lastUpdated,
      chartPoints,
      status,
      direction,
      errorMessage,
      isUsingFallback,
      targetPrice,
      distance,
    ],
  );

  return (
    <BtcFeedContext.Provider value={value}>{children}</BtcFeedContext.Provider>
  );
}

export function useBtcFeedContext(): BtcFeedContextValue {
  const ctx = useContext(BtcFeedContext);
  if (!ctx) {
    throw new Error("useBtcFeedContext must be used within BtcFeedProvider");
  }
  return ctx;
}
