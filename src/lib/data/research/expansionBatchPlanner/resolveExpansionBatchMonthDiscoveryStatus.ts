import type { ExpansionBatchMonthDiscoveryStatus } from "./expansionBatchDiscoveryUniverseTypes";

/** Classifies month-level discovery state from merged planner sources. */
export function resolveExpansionBatchMonthDiscoveryStatus(input: {
  discoveryResultCount: number;
  discoveryCacheCount: number;
  cacheSegmentPresent: boolean;
  cacheSegmentStale: boolean;
}): ExpansionBatchMonthDiscoveryStatus {
  if (input.cacheSegmentStale) {
    return "stale";
  }

  if (input.cacheSegmentPresent) {
    return input.discoveryCacheCount > 0 ? "discovered-nonempty" : "discovered-empty";
  }

  if (input.discoveryResultCount > 0) {
    return "discovered-nonempty";
  }

  return "unknown";
}

export function isExpansionBatchMonthDiscoveryProbed(
  status: ExpansionBatchMonthDiscoveryStatus,
): boolean {
  return status !== "unknown";
}
