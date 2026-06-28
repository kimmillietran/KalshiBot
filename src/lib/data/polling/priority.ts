import type { MarketPollPriority } from "./types";

/** Higher weight → shorter poll interval (more frequent). */
export const MARKET_POLL_PRIORITY_WEIGHT: Record<MarketPollPriority, number> = {
  critical: 1,
  high: 0.75,
  normal: 0.5,
  low: 0.25,
};

export function intervalMsForPriority(
  priority: MarketPollPriority,
  minIntervalMs: number,
  maxIntervalMs: number,
): number {
  const weight = MARKET_POLL_PRIORITY_WEIGHT[priority];
  return Math.round(maxIntervalMs - weight * (maxIntervalMs - minIntervalMs));
}
