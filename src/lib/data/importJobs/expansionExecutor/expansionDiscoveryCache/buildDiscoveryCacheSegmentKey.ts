import {
  EXPANSION_DISCOVERY_CACHE_API_VERSION,
  type ExpansionDiscoveryCacheSegmentKey,
} from "./expansionDiscoveryCacheTypes";

/** Builds the canonical cache key for a month-scoped discovery segment. */
export function buildDiscoveryCacheSegmentKey(input: {
  seriesTicker: string;
  calendarMonth: string;
  sampling: { after: string; before: string };
  apiVersion?: string;
}): ExpansionDiscoveryCacheSegmentKey {
  return {
    seriesTicker: input.seriesTicker,
    calendarMonth: input.calendarMonth,
    segmentStrategy: "month",
    windowStart: input.sampling.after,
    windowEnd: input.sampling.before,
    apiVersion: input.apiVersion ?? EXPANSION_DISCOVERY_CACHE_API_VERSION,
  };
}

export function discoveryCacheSegmentKeysMatch(
  left: ExpansionDiscoveryCacheSegmentKey,
  right: ExpansionDiscoveryCacheSegmentKey,
): boolean {
  return (
    left.seriesTicker === right.seriesTicker
    && left.calendarMonth === right.calendarMonth
    && left.segmentStrategy === right.segmentStrategy
    && left.windowStart === right.windowStart
    && left.windowEnd === right.windowEnd
    && left.apiVersion === right.apiVersion
  );
}
