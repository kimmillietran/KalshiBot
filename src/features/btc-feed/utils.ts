import type { BtcCandle, BtcChartPoint, PriceDirection } from "./types";
import { BTC_STALE_THRESHOLD_MS } from "./constants";

export function calculateDistanceFromTarget(
  livePrice: number,
  targetPrice: number,
): { distance: number; percent: number } {
  const distance = livePrice - targetPrice;
  const percent = targetPrice !== 0 ? (distance / targetPrice) * 100 : 0;
  return { distance, percent };
}

export function calculatePriceChangeDirection(
  previous: number | null,
  next: number,
): PriceDirection {
  if (previous === null) return "flat";
  if (next > previous) return "up";
  if (next < previous) return "down";
  return "flat";
}

export function formatFeedTime(date: Date): string {
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
}

export function formatCandleTime(timestampMs: number): string {
  return new Date(timestampMs).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function candlesToChartPoints(candles: BtcCandle[]): BtcChartPoint[] {
  return candles.map((c) => ({ time: c.time, price: c.close }));
}

/** Merge a live tick into the most recent candle or append a new point. */
export function mergeLivePriceIntoChart(
  points: BtcChartPoint[],
  livePrice: number,
  now = new Date(),
): BtcChartPoint[] {
  if (points.length === 0) {
    return [
      {
        time: formatCandleTime(now.getTime()),
        price: livePrice,
      },
    ];
  }

  const timeStr = formatCandleTime(now.getTime());
  const last = points[points.length - 1];

  if (last.time === timeStr) {
    return [...points.slice(0, -1), { time: timeStr, price: livePrice }];
  }

  const next = [...points, { time: timeStr, price: livePrice }];
  return next.length > 60 ? next.slice(-60) : next;
}

export function formatSignedDistance(value: number): string {
  const prefix = value >= 0 ? "+" : "";
  return `${prefix}${value.toFixed(2)}`;
}

/** Returns true when the last successful feed update exceeds the stale threshold. */
export function isFeedStale(
  lastUpdated: Date | null,
  nowMs: number = Date.now(),
  thresholdMs: number = BTC_STALE_THRESHOLD_MS,
): boolean {
  if (!lastUpdated) return false;
  return nowMs - lastUpdated.getTime() > thresholdMs;
}
