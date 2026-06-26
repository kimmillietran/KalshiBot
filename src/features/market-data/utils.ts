import type { ActiveBtcMarket } from "./types";
import type { KalshiMarket } from "./schemas";

export function computeTimeRemainingMs(
  closeTime: string | null,
  nowMs: number = Date.now(),
): number {
  if (!closeTime) return 0;
  const closeMs = Date.parse(closeTime);
  if (Number.isNaN(closeMs)) return 0;
  return Math.max(0, closeMs - nowMs);
}

export function formatCountdown(timeRemainingMs: number): string {
  if (timeRemainingMs <= 0) return "00:00";

  const totalSec = Math.floor(timeRemainingMs / 1000);
  const hours = Math.floor(totalSec / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;

  if (hours > 0) {
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function formatExpirationTime(closeTime: string | null): string {
  if (!closeTime) return "—";
  const date = new Date(closeTime);
  if (Number.isNaN(date.getTime())) return "—";

  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

export function formatMarketStatus(status: string): string {
  return status.replace(/_/g, " ").toUpperCase();
}

/**
 * Pick the open market with the nearest upcoming close_time.
 * Ties break on lexicographically earliest ticker for determinism.
 */
export function selectOpenMarket(
  markets: KalshiMarket[],
  nowMs: number = Date.now(),
): KalshiMarket | null {
  if (markets.length === 0) return null;
  if (markets.length === 1) return markets[0];

  const upcoming = markets
    .map((market) => ({
      market,
      closeMs: Date.parse(market.close_time),
    }))
    .filter(({ closeMs }) => !Number.isNaN(closeMs) && closeMs >= nowMs)
    .sort((a, b) => {
      if (a.closeMs !== b.closeMs) return a.closeMs - b.closeMs;
      return a.market.ticker.localeCompare(b.market.ticker);
    });

  if (upcoming.length > 0) return upcoming[0].market;

  return [...markets].sort((a, b) => {
    const aClose = Date.parse(a.close_time);
    const bClose = Date.parse(b.close_time);
    if (aClose !== bClose) return aClose - bClose;
    return a.ticker.localeCompare(b.ticker);
  })[0];
}

/**
 * Pick the unopened market with the earliest open_time.
 */
export function selectUnopenedMarket(markets: KalshiMarket[]): KalshiMarket | null {
  if (markets.length === 0) return null;
  if (markets.length === 1) return markets[0];

  return [...markets].sort((a, b) => {
    const aOpen = Date.parse(a.open_time);
    const bOpen = Date.parse(b.open_time);
    if (aOpen !== bOpen) return aOpen - bOpen;
    return a.ticker.localeCompare(b.ticker);
  })[0];
}

export function mapKalshiMarketToActiveBtc(
  market: KalshiMarket,
  now: Date = new Date(),
): ActiveBtcMarket {
  const closeTime = market.close_time;

  return {
    ticker: market.ticker,
    title: market.title,
    targetPrice: market.floor_strike ?? null,
    status: market.status,
    openTime: market.open_time,
    closeTime,
    timeRemainingMs: computeTimeRemainingMs(closeTime, now.getTime()),
    updatedAt: now.toISOString(),
    source: "kalshi",
    isFallback: false,
  };
}

export function isMarketFeedStale(
  lastFetchedAt: Date | null,
  nowMs: number = Date.now(),
  thresholdMs: number,
): boolean {
  if (!lastFetchedAt) return false;
  return nowMs - lastFetchedAt.getTime() > thresholdMs;
}
