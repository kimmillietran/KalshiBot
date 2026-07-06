import { posix } from "node:path";

import { DEFAULT_DISCOVERY_CACHE_TTL_HOURS } from "@/lib/data/importJobs/expansionExecutor/expansionDiscoveryCache/expansionDiscoveryCacheTypes";
import { evaluateDiscoveryCacheSegment } from "@/lib/data/importJobs/expansionExecutor/expansionDiscoveryCache/evaluateDiscoveryCacheSegment";
import { parseExpansionDiscoveryCacheSegmentJson } from "@/lib/data/importJobs/expansionExecutor/expansionDiscoveryCache/expansionDiscoveryCacheSegmentDocument";
import type { ExpansionDiscoveryCacheSegmentDocument } from "@/lib/data/importJobs/expansionExecutor/expansionDiscoveryCache/expansionDiscoveryCacheTypes";

import type {
  ExpansionBatchDiscoveryMonthSource,
  ExpansionBatchDiscoverySourcesByMonth,
} from "./expansionBatchDiscoveryUniverseTypes";
import type { ExpansionBatchPlannerIo } from "./expansionBatchPlannerTypes";
import { resolveExpansionBatchMonthDiscoveryStatus } from "./resolveExpansionBatchMonthDiscoveryStatus";

export type ExpansionBatchDiscoveryCacheIo = ExpansionBatchPlannerIo & {
  listDir?: (path: string) => readonly string[];
};

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/");
}

function walkJsonFiles(
  io: ExpansionBatchDiscoveryCacheIo,
  rootDir: string,
): string[] {
  if (!io.listDir || !io.fileExists(rootDir)) {
    return [];
  }

  const files: string[] = [];
  for (const seriesEntry of io.listDir(rootDir)) {
    const seriesPath = posix.join(normalizePath(rootDir), seriesEntry);
    if (!io.fileExists(seriesPath) || !io.listDir) {
      continue;
    }

    for (const file of io.listDir(seriesPath)) {
      if (file.endsWith(".json")) {
        files.push(posix.join(seriesPath, file));
      }
    }
  }

  return files;
}

function parseCacheSegment(
  io: ExpansionBatchDiscoveryCacheIo,
  path: string,
): ExpansionDiscoveryCacheSegmentDocument | null {
  try {
    const result = parseExpansionDiscoveryCacheSegmentJson(path, io.readFile(path));
    return result.ok ? result.entry : null;
  } catch {
    return null;
  }
}

/** Loads month-level discovery counts from executor discovery-cache segments. */
export function loadExpansionBatchDiscoveryCacheByMonth(
  io: ExpansionBatchDiscoveryCacheIo,
  discoveryCacheDir: string,
  options?: { nowMs?: number; ttlHours?: number },
): {
  countsByMonth: ReadonlyMap<string, number>;
  segmentsByMonth: ReadonlyMap<string, ExpansionDiscoveryCacheSegmentDocument>;
  staleMonths: string[];
} {
  const nowMs = options?.nowMs ?? Date.now();
  const ttlHours = options?.ttlHours ?? DEFAULT_DISCOVERY_CACHE_TTL_HOURS;
  const countsByMonth = new Map<string, number>();
  const segmentsByMonth = new Map<string, ExpansionDiscoveryCacheSegmentDocument>();
  const staleMonths: string[] = [];

  for (const path of walkJsonFiles(io, discoveryCacheDir)) {
    const segment = parseCacheSegment(io, path);
    if (!segment) {
      continue;
    }

    const month = segment.cacheKey.calendarMonth;
    countsByMonth.set(month, segment.marketCount);
    segmentsByMonth.set(month, segment);

    const status = evaluateDiscoveryCacheSegment({
      segment,
      ttlHours,
      nowMs,
      forcedRefresh: false,
    });
    if (status === "stale") {
      staleMonths.push(month);
    }
  }

  return {
    countsByMonth,
    segmentsByMonth,
    staleMonths: [...new Set(staleMonths)].sort(),
  };
}

/** Merges discovery-result counts with discovery-cache segment counts per month. */
export function mergeExpansionBatchDiscoverySourcesByMonth(input: {
  discoveryResultByMonth: ReadonlyMap<string, number>;
  discoveryCacheByMonth: ReadonlyMap<string, number>;
  staleCacheMonths: readonly string[];
}): ExpansionBatchDiscoverySourcesByMonth {
  const months = new Set<string>([
    ...input.discoveryResultByMonth.keys(),
    ...input.discoveryCacheByMonth.keys(),
  ]);
  const staleSet = new Set(input.staleCacheMonths);
  const merged = new Map<string, ExpansionBatchDiscoveryMonthSource>();

  for (const month of months) {
    const discoveryResultCount = input.discoveryResultByMonth.get(month) ?? 0;
    const discoveryCacheCount = input.discoveryCacheByMonth.get(month) ?? 0;
    const cacheSegmentPresent = input.discoveryCacheByMonth.has(month);

    merged.set(month, {
      discoveryResultCount,
      discoveryCacheCount,
      mergedDiscoveryCount: Math.max(discoveryResultCount, discoveryCacheCount),
      cacheSegmentPresent,
      cacheSegmentStale: staleSet.has(month),
      discoveryStatus: resolveExpansionBatchMonthDiscoveryStatus({
        discoveryResultCount,
        discoveryCacheCount,
        cacheSegmentPresent,
        cacheSegmentStale: staleSet.has(month),
      }),
    });
  }

  return merged;
}

/** Returns merged discovery counts per month from all loaded sources. */
export function mergedDiscoveryCountsByMonth(
  sources: ExpansionBatchDiscoverySourcesByMonth,
): ReadonlyMap<string, number> {
  const counts = new Map<string, number>();
  for (const [month, source] of sources.entries()) {
    if (source.discoveryStatus === "unknown") {
      continue;
    }

    counts.set(month, source.mergedDiscoveryCount);
  }
  return counts;
}
