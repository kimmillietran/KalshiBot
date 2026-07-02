import type { HistoricalImporter } from "@/lib/data/importers/kalshi/HistoricalImporter";
import type {
  HistoricalImportProvenance,
  HistoricalMarketRecord,
} from "@/lib/data/importers/kalshi/kalshiHistoricalTypes";

import {
  applyMarketSamplingFilters,
  hasMarketDiscoverySamplingOptions,
} from "./applyMarketSamplingFilters";
import {
  canUseDiscoveryEarlyStop,
  formatDiscoveryProgressMessage,
  getDiscoveryEarlyStopTarget,
  shouldStopDiscoveryPagination,
} from "./discoveryEarlyStop";
import {
  fetchDiscoveryPageWithRetry,
  parseMarketDiscoveryRateLimitOptions,
  sleepMs,
  type MarketDiscoveryRateLimitLogger,
  type MarketDiscoveryRateLimitOptions,
} from "./discoveryRateLimit";
import {
  MarketDiscoveryError,
  type DiscoveredMarket,
  type DiscoverKalshiHistoricalMarketsInput,
  type MarketDiscoveryProgressSummary,
  type MarketDiscoveryResult,
  type MarketDiscoverySamplingOptions,
} from "./discoveryTypes";
import { normalizeDiscoveredMarket } from "./normalizeDiscoveredMarket";
import { serializeMarketDiscoveryResult } from "./serializeMarketDiscoveryResult";
import { validateMarketDiscoveryResult } from "./validateMarketDiscoveryResult";

const DEFAULT_PAGE_SIZE = 100;

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object") {
    return value;
  }

  Object.freeze(value);

  if (Array.isArray(value)) {
    for (const item of value) {
      deepFreeze(item);
    }
  } else {
    for (const nested of Object.values(value)) {
      deepFreeze(nested);
    }
  }

  return value;
}

function compareDiscoveredMarkets(
  left: DiscoveredMarket,
  right: DiscoveredMarket,
): number {
  return left.marketTicker.localeCompare(right.marketTicker);
}

export type { DiscoverKalshiHistoricalMarketsInput } from "./discoveryTypes";

export type MarketDiscoveryProgressLogger = (message: string) => void;

export type KalshiHistoricalMarketDiscoveryOptions = {
  importer: HistoricalImporter;
  pageSize?: number;
  now?: () => Date;
  rateLimit?: MarketDiscoveryRateLimitOptions;
  logRateLimitWarning?: MarketDiscoveryRateLimitLogger;
  logDiscoveryProgress?: MarketDiscoveryProgressLogger;
  sleep?: (ms: number) => Promise<void>;
};

type ListHistoricalMarketsResult = {
  markets: Array<{
    market: HistoricalMarketRecord;
    provenance: HistoricalImportProvenance;
  }>;
  pages: HistoricalImportProvenance[];
  pageCount: number;
  earlyStopApplied: boolean;
  limitTarget: number | null;
};

function logProgress(
  logger: MarketDiscoveryProgressLogger | undefined,
  message: string,
): void {
  logger?.(formatDiscoveryProgressMessage(message));
}

async function listHistoricalMarkets(
  seriesTicker: string,
  options: KalshiHistoricalMarketDiscoveryOptions,
  sampling?: MarketDiscoverySamplingOptions,
): Promise<ListHistoricalMarketsResult> {
  const pageSize = options.pageSize ?? DEFAULT_PAGE_SIZE;
  const rateLimit = parseMarketDiscoveryRateLimitOptions(options.rateLimit);
  const earlyStopEnabled = canUseDiscoveryEarlyStop(sampling);
  const limitTarget =
    earlyStopEnabled && sampling ? getDiscoveryEarlyStopTarget(sampling) : null;
  const markets: Array<{
    market: HistoricalMarketRecord;
    provenance: HistoricalImportProvenance;
  }> = [];
  const pages: HistoricalImportProvenance[] = [];
  let cursor: string | undefined;
  let pageCount = 0;
  let earlyStopApplied = false;

  if (earlyStopEnabled && limitTarget === 0) {
    logProgress(
      options.logDiscoveryProgress,
      "early stop: collected 0 >= target 0",
    );
    return {
      markets,
      pages,
      pageCount,
      earlyStopApplied: true,
      limitTarget,
    };
  }

  do {
    const page = await fetchDiscoveryPageWithRetry({
      fetchPage: () =>
        options.importer.listHistoricalMarkets(seriesTicker, undefined, {
          limit: pageSize,
          ...(cursor ? { cursor } : {}),
        }),
      rateLimit,
      logWarning: options.logRateLimitWarning,
      sleep: options.sleep,
    });

    pageCount += 1;
    pages.push({ ...page.provenance });
    for (const market of page.markets) {
      markets.push({
        market,
        provenance: { ...page.provenance },
      });
    }

    logProgress(
      options.logDiscoveryProgress,
      `page=${pageCount} collected=${markets.length} limitTarget=${
        limitTarget ?? "full"
      }`,
    );

    if (
      earlyStopEnabled
      && limitTarget !== null
      && shouldStopDiscoveryPagination({
        collectedCount: markets.length,
        limitTarget,
      })
    ) {
      earlyStopApplied = true;
      logProgress(
        options.logDiscoveryProgress,
        `early stop: collected ${markets.length} >= target ${limitTarget}`,
      );
      break;
    }

    cursor = page.cursor.trim() ? page.cursor : undefined;

    if (cursor && rateLimit.requestDelayMs > 0) {
      await sleepMs(rateLimit.requestDelayMs, options.sleep);
    }
  } while (cursor);

  return {
    markets,
    pages,
    pageCount,
    earlyStopApplied,
    limitTarget,
  };
}

function buildProgressSummary(input: {
  sampling?: MarketDiscoverySamplingOptions;
  pageCount: number;
  earlyStopApplied: boolean;
  limitTarget: number | null;
}): MarketDiscoveryProgressSummary | undefined {
  if (input.sampling?.limit === undefined) {
    return undefined;
  }

  const limitTarget =
    input.limitTarget ?? getDiscoveryEarlyStopTarget(input.sampling);

  return {
    earlyStopApplied: input.earlyStopApplied,
    pagesFetched: input.pageCount,
    limitTarget,
    totalDiscoveredMayBePartial: input.earlyStopApplied,
  };
}

/** Discovers and normalizes historical Kalshi markets for a configured series ticker. */
export async function discoverKalshiHistoricalMarkets(
  input: DiscoverKalshiHistoricalMarketsInput,
  options: KalshiHistoricalMarketDiscoveryOptions,
): Promise<MarketDiscoveryResult> {
  const seriesTicker = input.seriesTicker.trim();
  if (!seriesTicker) {
    throw new MarketDiscoveryError("seriesTicker is required");
  }

  const discoveredAt = (options.now ?? (() => new Date()))().toISOString();
  const {
    markets,
    pages,
    pageCount,
    earlyStopApplied,
    limitTarget,
  } = await listHistoricalMarkets(seriesTicker, options, input.sampling);

  const sortedMarkets = markets
    .map(({ market, provenance }) =>
      normalizeDiscoveredMarket({
        seriesTicker,
        market,
        provenance,
      }),
    )
    .sort(compareDiscoveredMarkets);

  const samplingResult = applyMarketSamplingFilters(sortedMarkets, input.sampling);
  const normalizedMarkets = samplingResult.markets;
  const validation = validateMarketDiscoveryResult(normalizedMarkets);
  const progress = buildProgressSummary({
    sampling: input.sampling,
    pageCount,
    earlyStopApplied,
    limitTarget,
  });

  return deepFreeze({
    metadata: {
      seriesTicker,
      discoveredAt,
      marketCount: normalizedMarkets.length,
      pageCount,
      ...(hasMarketDiscoverySamplingOptions(input.sampling)
        ? { sampling: samplingResult.summary }
        : {}),
      ...(progress ? { progress } : {}),
    },
    markets: normalizedMarkets,
    validation,
    provenance: {
      pages,
    },
  });
}

export { serializeMarketDiscoveryResult };
