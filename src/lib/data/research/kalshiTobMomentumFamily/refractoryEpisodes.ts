import { REFRACTORY_FLOOR_MS } from "./momentumFamilyTypes";
import type { MomentumCrossingEvent } from "./firstCrossingEvents";

export function refractoryPeriodMs(forwardHorizonMs: number): number {
  return Math.max(forwardHorizonMs, REFRACTORY_FLOOR_MS);
}

export function applyRefractoryEpisodeFilter(input: {
  events: readonly MomentumCrossingEvent[];
  forwardHorizonMs: number;
}): {
  accepted: MomentumCrossingEvent[];
  suppressedOverlapping: MomentumCrossingEvent[];
  refractoryMs: number;
} {
  const refractoryMs = refractoryPeriodMs(input.forwardHorizonMs);
  const sorted = [...input.events].sort((a, b) => {
    if (a.marketTicker !== b.marketTicker) {
      return a.marketTicker.localeCompare(b.marketTicker);
    }
    return a.eventTimestampMs - b.eventTimestampMs;
  });

  const accepted: MomentumCrossingEvent[] = [];
  const suppressedOverlapping: MomentumCrossingEvent[] = [];
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
