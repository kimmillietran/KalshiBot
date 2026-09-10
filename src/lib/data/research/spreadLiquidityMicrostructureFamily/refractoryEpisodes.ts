import { REFRACTORY_FLOOR_MS } from "./microstructureFamilyTypes";
import type { TobImbalanceCrossingEvent } from "./firstCrossingEvents";

export function refractoryPeriodMs(responseHorizonMs: number): number {
  return Math.max(responseHorizonMs, REFRACTORY_FLOOR_MS);
}

/**
 * After an accepted event, suppress subsequent events on the same market whose
 * event timestamps fall inside the refractory window of a prior accepted event.
 * R = max(H, 2000ms) prevents overlapping response windows from becoming
 * independent pseudo-replicates.
 */
export function applyRefractoryEpisodeFilter(input: {
  events: readonly TobImbalanceCrossingEvent[];
  responseHorizonMs: number;
}): {
  accepted: TobImbalanceCrossingEvent[];
  suppressedOverlapping: TobImbalanceCrossingEvent[];
  refractoryMs: number;
} {
  const refractoryMs = refractoryPeriodMs(input.responseHorizonMs);
  const sorted = [...input.events].sort((a, b) => {
    if (a.marketTicker !== b.marketTicker) {
      return a.marketTicker.localeCompare(b.marketTicker);
    }
    return a.eventTimestampMs - b.eventTimestampMs;
  });

  const accepted: TobImbalanceCrossingEvent[] = [];
  const suppressedOverlapping: TobImbalanceCrossingEvent[] = [];
  const nextEligibleByMarket = new Map<string, number>();

  for (const event of sorted) {
    const nextEligible = nextEligibleByMarket.get(event.marketTicker) ?? Number.NEGATIVE_INFINITY;
    if (event.eventTimestampMs < nextEligible) {
      suppressedOverlapping.push(event);
      continue;
    }
    accepted.push(event);
    nextEligibleByMarket.set(event.marketTicker, event.eventTimestampMs + refractoryMs);
  }

  return { accepted, suppressedOverlapping, refractoryMs };
}
