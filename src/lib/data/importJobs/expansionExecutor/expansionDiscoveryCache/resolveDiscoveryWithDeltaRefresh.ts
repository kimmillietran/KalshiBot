import { posix } from "node:path";

import { calendarMonthsBetween } from "@/lib/data/research/coveragePlanner/coveragePlannerDateUtils";

import type { ExpansionExecutorIo } from "../expansionExecutorTypes";
import type { ExpansionDiscoveredMarket } from "../expansionExecutorTypes";
import type { HistoricalExpansionImportExecutorConfig } from "../expansionExecutorTypes";
import { buildDiscoveryCacheSegmentKey } from "./buildDiscoveryCacheSegmentKey";
import { buildDiscoveryCacheSegmentPath } from "./buildDiscoveryCacheSegmentPath";
import {
  calendarMonthToDiscoverySamplingWindow,
  marketOpenTimeWithinSamplingWindow,
} from "./calendarMonthDiscoveryWindow";
import type {
  ExpansionDiscoveryDeltaRefreshDiagnostics,
  ExpansionDiscoveryCacheSegmentDocument,
  ExpansionDiscoveryCacheSegmentStatus,
} from "./expansionDiscoveryCacheTypes";
import {
  buildExpansionDiscoveryCacheSegmentDocument,
  parseExpansionDiscoveryCacheSegmentJson,
  serializeExpansionDiscoveryCacheSegment,
} from "./expansionDiscoveryCacheSegmentDocument";
import {
  evaluateDiscoveryCacheSegment,
  shouldRefreshDiscoveryCacheSegment,
} from "./evaluateDiscoveryCacheSegment";
import { mergeExpansionDiscoveredMarkets } from "./mergeExpansionDiscoveredMarkets";
import { validateExpansionDiscoveredMarkets } from "./validateExpansionDiscoveredMarketWire";

type DiscoverMarketsFn = (
  seriesTicker: string,
  sampling: { after: string; before: string },
) => Promise<readonly ExpansionDiscoveredMarket[]>;

function filterMarketsToSamplingWindow(
  markets: readonly ExpansionDiscoveredMarket[],
  sampling: { after: string; before: string },
): ExpansionDiscoveredMarket[] {
  return markets.filter((market) =>
    marketOpenTimeWithinSamplingWindow(market.openTime, sampling),
  );
}

type LoadedCacheSegment = {
  segment: ExpansionDiscoveryCacheSegmentDocument | null;
  corruptReason: string | null;
};

function loadCacheSegment(
  io: ExpansionExecutorIo,
  path: string,
  expectedKey: ReturnType<typeof buildDiscoveryCacheSegmentKey>,
): LoadedCacheSegment {
  if (!io.fileExists(path)) {
    return { segment: null, corruptReason: null };
  }

  const parsed = parseExpansionDiscoveryCacheSegmentJson(path, io.readFile(path), expectedKey);
  if (!parsed.ok) {
    return { segment: null, corruptReason: parsed.reason };
  }

  return { segment: parsed.entry, corruptReason: null };
}

function writeCacheSegment(
  io: ExpansionExecutorIo,
  path: string,
  segment: ExpansionDiscoveryCacheSegmentDocument,
): void {
  io.mkdirSync(posix.dirname(path), { recursive: true });
  io.writeFile(path, serializeExpansionDiscoveryCacheSegment(segment));
}

function recordSegmentDiagnostics(
  diagnostics: ExpansionDiscoveryDeltaRefreshDiagnostics,
  path: string,
  status: ExpansionDiscoveryCacheSegmentStatus,
  marketCount = 0,
  savingsMs = 0,
): void {
  diagnostics.discoverySegmentsRequested += 1;
  diagnostics.discoverySegmentPaths = [...diagnostics.discoverySegmentPaths, path].sort();

  if (status === "cache-hit") {
    diagnostics.discoverySegmentsCacheHit += 1;
    diagnostics.totalDiscoveredFromCacheCount += marketCount;
    diagnostics.estimatedDiscoverySavingsMs += savingsMs;
    return;
  }

  if (status === "cache-corrupt") {
    diagnostics.discoverySegmentsCorrupt += 1;
  }

  if (status === "stale" || status === "forced-refresh") {
    diagnostics.discoverySegmentsStale += 1;
  }

  if (status !== "cache-disabled") {
    diagnostics.discoverySegmentsRefreshed += 1;
  }
}

async function resolveMonthSegmentMarkets(input: {
  seriesTicker: string;
  calendarMonth: string;
  discoverMarkets: DiscoverMarketsFn;
  io: ExpansionExecutorIo;
  config: Pick<
    HistoricalExpansionImportExecutorConfig,
    | "discoveryCacheDir"
    | "discoveryCacheTtlHours"
    | "refreshDiscoveryMonth"
    | "refreshDiscoveryCache"
    | "useDiscoveryCache"
  >;
  generatedAt: string;
  diagnostics: ExpansionDiscoveryDeltaRefreshDiagnostics;
  nowMs: number;
  warnings: string[];
}): Promise<readonly ExpansionDiscoveredMarket[]> {
  const monthSampling = calendarMonthToDiscoverySamplingWindow(input.calendarMonth);
  const expectedKey = buildDiscoveryCacheSegmentKey({
    seriesTicker: input.seriesTicker,
    calendarMonth: input.calendarMonth,
    sampling: monthSampling,
  });
  const segmentPath = buildDiscoveryCacheSegmentPath({
    cacheDir: input.config.discoveryCacheDir,
    seriesTicker: input.seriesTicker,
    calendarMonth: input.calendarMonth,
  });

  if (!input.config.useDiscoveryCache) {
    recordSegmentDiagnostics(input.diagnostics, segmentPath, "cache-disabled");
    return input.discoverMarkets(input.seriesTicker, monthSampling);
  }

  const forcedRefresh =
    input.config.refreshDiscoveryCache
    || input.config.refreshDiscoveryMonth === input.calendarMonth;
  const loaded = loadCacheSegment(input.io, segmentPath, expectedKey);

  if (loaded.corruptReason) {
    recordSegmentDiagnostics(input.diagnostics, segmentPath, "cache-corrupt");
    input.warnings.push(
      `Discovery cache segment corrupt at ${segmentPath}: ${loaded.corruptReason}. Refreshing from live discovery.`,
    );
  }

  const status = loaded.corruptReason
    ? "cache-corrupt"
    : evaluateDiscoveryCacheSegment({
        segment: loaded.segment,
        ttlHours: input.config.discoveryCacheTtlHours,
        nowMs: input.nowMs,
        forcedRefresh,
      });

  if (!loaded.corruptReason) {
    recordSegmentDiagnostics(
      input.diagnostics,
      segmentPath,
      status,
      loaded.segment?.markets.length ?? 0,
      loaded.segment?.discoveryFetchDurationMs ?? 0,
    );
  }

  if (!shouldRefreshDiscoveryCacheSegment(status) && loaded.segment) {
    return loaded.segment.markets;
  }

  const fetchStartedAtMs = Date.now();
  const discovered = await input.discoverMarkets(input.seriesTicker, monthSampling);
  const discoveryFetchDurationMs = Date.now() - fetchStartedAtMs;
  const segmentMarkets = filterMarketsToSamplingWindow(discovered, monthSampling);
  const validationIssue = validateExpansionDiscoveredMarkets(segmentMarkets);
  if (validationIssue) {
    input.warnings.push(
      `Discovery for ${input.calendarMonth} returned invalid markets: ${validationIssue}. Skipping cache write.`,
    );
    return segmentMarkets;
  }

  const document = buildExpansionDiscoveryCacheSegmentDocument({
    seriesTicker: input.seriesTicker,
    calendarMonth: input.calendarMonth,
    generatedAt: input.generatedAt,
    sampling: monthSampling,
    markets: segmentMarkets,
    discoveryFetchDurationMs,
  });
  writeCacheSegment(input.io, segmentPath, document);
  return document.markets;
}

/** Resolves discovery for a window using month-scoped cache segments and delta refresh. */
export async function resolveDiscoveryWithDeltaRefresh(input: {
  seriesTicker: string;
  sampling: { after: string; before: string };
  discoverMarkets: DiscoverMarketsFn;
  io: ExpansionExecutorIo;
  config: Pick<
    HistoricalExpansionImportExecutorConfig,
    | "discoveryCacheDir"
    | "discoveryCacheSegment"
    | "discoveryCacheTtlHours"
    | "refreshDiscoveryMonth"
    | "refreshDiscoveryCache"
    | "useDiscoveryCache"
  >;
  generatedAt: string;
  diagnostics: ExpansionDiscoveryDeltaRefreshDiagnostics;
  warnings?: string[];
  nowMs?: number;
}): Promise<readonly ExpansionDiscoveredMarket[]> {
  if (!input.config.useDiscoveryCache || input.config.discoveryCacheSegment !== "month") {
    return input.discoverMarkets(input.seriesTicker, input.sampling);
  }

  const months = calendarMonthsBetween(input.sampling.after, input.sampling.before);
  if (months.length === 0) {
    return input.discoverMarkets(input.seriesTicker, input.sampling);
  }

  const nowMs = input.nowMs ?? Date.parse(input.generatedAt);
  const warnings = input.warnings ?? [];
  const segmentResults: ExpansionDiscoveredMarket[][] = [];

  for (const calendarMonth of months) {
    const markets = await resolveMonthSegmentMarkets({
      seriesTicker: input.seriesTicker,
      calendarMonth,
      discoverMarkets: input.discoverMarkets,
      io: input.io,
      config: input.config,
      generatedAt: input.generatedAt,
      diagnostics: input.diagnostics,
      nowMs,
      warnings,
    });
    segmentResults.push([...markets]);
  }

  const merged = mergeExpansionDiscoveredMarkets(segmentResults);
  return filterMarketsToSamplingWindow(merged, input.sampling);
}

/** Wraps live discovery with month-scoped delta refresh against persistent cache segments. */
export function createDeltaRefreshDiscoverMarkets(input: {
  discoverMarkets: DiscoverMarketsFn;
  io: ExpansionExecutorIo;
  config: Pick<
    HistoricalExpansionImportExecutorConfig,
    | "discoveryCacheDir"
    | "discoveryCacheSegment"
    | "discoveryCacheTtlHours"
    | "refreshDiscoveryMonth"
    | "refreshDiscoveryCache"
    | "useDiscoveryCache"
  >;
  generatedAt: string;
  diagnostics: ExpansionDiscoveryDeltaRefreshDiagnostics;
  warnings?: string[];
}): DiscoverMarketsFn {
  return async (seriesTicker, sampling) =>
    resolveDiscoveryWithDeltaRefresh({
      seriesTicker,
      sampling,
      discoverMarkets: input.discoverMarkets,
      io: input.io,
      config: input.config,
      generatedAt: input.generatedAt,
      diagnostics: input.diagnostics,
      warnings: input.warnings,
    });
}
