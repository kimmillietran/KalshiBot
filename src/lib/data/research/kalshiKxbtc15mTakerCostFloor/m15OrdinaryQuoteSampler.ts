/**
 * Deterministic ordinary-quote sampler — cadence only; never price/outcome conditioned.
 */
import { utcTradingDayFromTimestampMs } from "@/lib/data/research/kalshiTobMomentumFamily";

import { M15_SAMPLE_CADENCE_MS } from "./m15CostFloorTypes";

export function buildM15IndependentUnitKey(input: {
  marketTicker: string;
  tradingDayUtc: string;
}): string {
  return `${input.marketTicker}:${input.tradingDayUtc}`;
}

/**
 * Cadence bucket index for a timestamp (UTC ms).
 * Sample selection: first eligible quote at-or-after each new cadence boundary
 * per market (file-order stream).
 */
export function m15CadenceBucket(timestampMs: number, cadenceMs = M15_SAMPLE_CADENCE_MS): number {
  return Math.floor(timestampMs / cadenceMs);
}

export function m15TradingDayUtc(timestampMs: number): string {
  return utcTradingDayFromTimestampMs(timestampMs);
}

/**
 * Pure helper: given sorted eligible timestamps for one market, pick sample
 * entry times at cadence boundaries (first ts ≥ boundary).
 */
export function selectCadenceSampleTimestamps(input: {
  eligibleTimestampsMs: readonly number[];
  cadenceMs?: number;
}): number[] {
  const cadenceMs = input.cadenceMs ?? M15_SAMPLE_CADENCE_MS;
  const sorted = [...input.eligibleTimestampsMs].sort((a, b) => a - b);
  const selected: number[] = [];
  let nextBoundary = sorted.length > 0
    ? Math.floor(sorted[0]! / cadenceMs) * cadenceMs
    : 0;
  for (const ts of sorted) {
    if (ts >= nextBoundary) {
      selected.push(ts);
      nextBoundary = (Math.floor(ts / cadenceMs) + 1) * cadenceMs;
    }
  }
  return selected;
}
