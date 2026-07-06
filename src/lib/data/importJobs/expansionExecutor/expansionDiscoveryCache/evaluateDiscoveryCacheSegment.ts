import type { ExpansionDiscoveryCacheSegmentDocument } from "./expansionDiscoveryCacheTypes";
import type { ExpansionDiscoveryCacheSegmentStatus } from "./expansionDiscoveryCacheTypes";

/** Determines whether a cached discovery segment is fresh, stale, or missing. */
export function evaluateDiscoveryCacheSegment(input: {
  segment: ExpansionDiscoveryCacheSegmentDocument | null;
  ttlHours: number | null;
  nowMs: number;
  forcedRefresh: boolean;
}): ExpansionDiscoveryCacheSegmentStatus {
  if (input.forcedRefresh) {
    return input.segment ? "forced-refresh" : "missing";
  }

  if (!input.segment) {
    return "missing";
  }

  if (input.ttlHours === null) {
    return "cache-hit";
  }

  const generatedAtMs = Date.parse(input.segment.generatedAt);
  if (!Number.isFinite(generatedAtMs)) {
    return "stale";
  }

  const ageMs = input.nowMs - generatedAtMs;
  const ttlMs = input.ttlHours * 60 * 60 * 1000;
  return ageMs <= ttlMs ? "cache-hit" : "stale";
}

export function shouldRefreshDiscoveryCacheSegment(
  status: ExpansionDiscoveryCacheSegmentStatus,
): boolean {
  return status !== "cache-hit";
}
