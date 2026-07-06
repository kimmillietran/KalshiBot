import { z } from "zod";

import { stableStringify } from "@/lib/trading/config/hashConfig";

import type { ExpansionDiscoveredMarket } from "../expansionExecutorTypes";
import { buildDiscoveryCacheSegmentKey, discoveryCacheSegmentKeysMatch } from "./buildDiscoveryCacheSegmentKey";
import { computeDiscoveryCacheChecksum } from "./computeDiscoveryCacheChecksum";
import type { ExpansionDiscoveryCacheSegmentDocument } from "./expansionDiscoveryCacheTypes";
import { validateExpansionDiscoveredMarkets } from "./validateExpansionDiscoveredMarketWire";

const marketSchema = z.object({
  marketTicker: z.string().trim().min(1),
  seriesTicker: z.string().trim().min(1),
  eventTicker: z.string().trim().min(1),
  status: z.string(),
  openTime: z.string().nullable(),
  closeTime: z.string().nullable(),
  settlementTime: z.string().nullable(),
  expirationValue: z.string().nullable(),
  title: z.string().nullable(),
  subtitle: z.string().nullable(),
  listMarketWire: z.record(z.string(), z.unknown()),
  provenance: z.object({
    source: z.string(),
    fetchedAt: z.string(),
    requestUrl: z.string().nullable().optional(),
    pageIndex: z.number().nullable().optional(),
  }).passthrough(),
});

const cacheKeySchema = z.object({
  seriesTicker: z.string().trim().min(1),
  calendarMonth: z.string().regex(/^\d{4}-\d{2}$/),
  segmentStrategy: z.literal("month"),
  windowStart: z.string().trim().min(1),
  windowEnd: z.string().trim().min(1),
  apiVersion: z.string().trim().min(1),
});

const segmentSchema = z.object({
  cacheKey: cacheKeySchema,
  generatedAt: z.string().trim().min(1),
  checksum: z.string().trim().min(1),
  discoveryFetchDurationMs: z.number().finite().nonnegative().nullable(),
  marketCount: z.number().finite().nonnegative(),
  markets: z.array(marketSchema),
});

export type ParseExpansionDiscoveryCacheSegmentResult =
  | { ok: true; entry: ExpansionDiscoveryCacheSegmentDocument }
  | { ok: false; reason: string };

/** Parses a month-scoped expansion discovery cache segment JSON document. */
export function parseExpansionDiscoveryCacheSegmentJson(
  path: string,
  json: string,
  expectedKey?: ReturnType<typeof buildDiscoveryCacheSegmentKey>,
): ParseExpansionDiscoveryCacheSegmentResult {
  let parsed: unknown;

  try {
    parsed = JSON.parse(json);
  } catch {
    return { ok: false, reason: `Invalid JSON in expansion discovery cache segment: ${path}` };
  }

  const result = segmentSchema.safeParse(parsed);
  if (!result.success) {
    return {
      ok: false,
      reason: `Invalid expansion discovery cache segment schema in ${path}: ${result.error.message}`,
    };
  }

  const entry = {
    ...result.data,
    markets: result.data.markets as ExpansionDiscoveredMarket[],
  };

  if (expectedKey && !discoveryCacheSegmentKeysMatch(entry.cacheKey, expectedKey)) {
    return { ok: false, reason: `cache key mismatch in ${path}` };
  }

  if (entry.marketCount !== entry.markets.length) {
    return { ok: false, reason: `marketCount mismatch in ${path}` };
  }

  const wireIssue = validateExpansionDiscoveredMarkets(entry.markets);
  if (wireIssue) {
    return { ok: false, reason: `${wireIssue} in ${path}` };
  }

  const checksum = computeDiscoveryCacheChecksum(entry.markets);
  if (checksum !== entry.checksum) {
    return { ok: false, reason: `checksum mismatch in ${path}` };
  }

  return { ok: true, entry };
}

/** Serializes a month-scoped expansion discovery cache segment. */
export function serializeExpansionDiscoveryCacheSegment(
  segment: ExpansionDiscoveryCacheSegmentDocument,
): string {
  return stableStringify({
    ...segment,
    marketCount: segment.markets.length,
    checksum: computeDiscoveryCacheChecksum(segment.markets),
    markets: [...segment.markets],
  });
}

export function buildExpansionDiscoveryCacheSegmentDocument(input: {
  seriesTicker: string;
  calendarMonth: string;
  generatedAt: string;
  sampling: { after: string; before: string };
  markets: readonly ExpansionDiscoveredMarket[];
  discoveryFetchDurationMs?: number | null;
}): ExpansionDiscoveryCacheSegmentDocument {
  const markets = [...input.markets];
  return {
    cacheKey: buildDiscoveryCacheSegmentKey({
      seriesTicker: input.seriesTicker,
      calendarMonth: input.calendarMonth,
      sampling: input.sampling,
    }),
    generatedAt: input.generatedAt,
    checksum: computeDiscoveryCacheChecksum(markets),
    discoveryFetchDurationMs: input.discoveryFetchDurationMs ?? null,
    marketCount: markets.length,
    markets,
  };
}
