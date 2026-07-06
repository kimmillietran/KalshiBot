import type { ExpansionDiscoveredMarket } from "../expansionExecutorTypes";

export const DEFAULT_EXPANSION_DISCOVERY_CACHE_DIR =
  "data/research-results/discovery-cache";
export const DEFAULT_DISCOVERY_CACHE_SEGMENT = "month" as const;
export const DEFAULT_DISCOVERY_CACHE_TTL_HOURS = 24;
export const EXPANSION_DISCOVERY_CACHE_API_VERSION =
  "kalshi-historical-list-markets-v1";

export const DISCOVERY_CACHE_SEGMENT_STRATEGIES = ["month"] as const;

export type DiscoveryCacheSegmentStrategy =
  (typeof DISCOVERY_CACHE_SEGMENT_STRATEGIES)[number];

export type ExpansionDiscoveryCacheSegmentKey = {
  seriesTicker: string;
  calendarMonth: string;
  segmentStrategy: DiscoveryCacheSegmentStrategy;
  windowStart: string;
  windowEnd: string;
  apiVersion: string;
};

export type ExpansionDiscoveryCacheSegmentDocument = {
  cacheKey: ExpansionDiscoveryCacheSegmentKey;
  generatedAt: string;
  checksum: string;
  discoveryFetchDurationMs: number | null;
  marketCount: number;
  markets: readonly ExpansionDiscoveredMarket[];
};

export type ExpansionDiscoveryCacheSegmentStatus =
  | "cache-hit"
  | "missing"
  | "stale"
  | "forced-refresh"
  | "cache-corrupt"
  | "cache-disabled";

export type ExpansionDiscoveryDeltaRefreshDiagnostics = {
  cacheEnabled: boolean;
  discoverySegmentsRequested: number;
  discoverySegmentsCacheHit: number;
  discoverySegmentsRefreshed: number;
  discoverySegmentsStale: number;
  discoverySegmentsCorrupt: number;
  discoverySegmentPaths: readonly string[];
  totalDiscoveredFromCacheCount: number;
  estimatedDiscoverySavingsMs: number;
};

export function createExpansionDiscoveryDeltaRefreshDiagnostics(
  cacheEnabled = true,
): ExpansionDiscoveryDeltaRefreshDiagnostics {
  return {
    cacheEnabled,
    discoverySegmentsRequested: 0,
    discoverySegmentsCacheHit: 0,
    discoverySegmentsRefreshed: 0,
    discoverySegmentsStale: 0,
    discoverySegmentsCorrupt: 0,
    discoverySegmentPaths: [],
    totalDiscoveredFromCacheCount: 0,
    estimatedDiscoverySavingsMs: 0,
  };
}

export function mergeExpansionDiscoveryDeltaRefreshDiagnostics(
  target: ExpansionDiscoveryDeltaRefreshDiagnostics,
  source: ExpansionDiscoveryDeltaRefreshDiagnostics,
): void {
  target.cacheEnabled = target.cacheEnabled && source.cacheEnabled;
  target.discoverySegmentsRequested += source.discoverySegmentsRequested;
  target.discoverySegmentsCacheHit += source.discoverySegmentsCacheHit;
  target.discoverySegmentsRefreshed += source.discoverySegmentsRefreshed;
  target.discoverySegmentsStale += source.discoverySegmentsStale;
  target.discoverySegmentsCorrupt += source.discoverySegmentsCorrupt;
  target.discoverySegmentPaths = [
    ...new Set([...target.discoverySegmentPaths, ...source.discoverySegmentPaths]),
  ].sort();
  target.totalDiscoveredFromCacheCount += source.totalDiscoveredFromCacheCount;
  target.estimatedDiscoverySavingsMs += source.estimatedDiscoverySavingsMs;
}
