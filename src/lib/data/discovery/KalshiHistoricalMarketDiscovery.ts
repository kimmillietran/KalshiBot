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
  MarketDiscoveryError,
  type DiscoveredMarket,
  type DiscoverKalshiHistoricalMarketsInput,
  type MarketDiscoveryResult,
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

export type KalshiHistoricalMarketDiscoveryOptions = {
  importer: HistoricalImporter;
  pageSize?: number;
  now?: () => Date;
};

async function listAllHistoricalMarkets(
  seriesTicker: string,
  options: KalshiHistoricalMarketDiscoveryOptions,
): Promise<{
  markets: Array<{
    market: HistoricalMarketRecord;
    provenance: HistoricalImportProvenance;
  }>;
  pages: HistoricalImportProvenance[];
  pageCount: number;
}> {
  const pageSize = options.pageSize ?? DEFAULT_PAGE_SIZE;
  const markets: Array<{
    market: HistoricalMarketRecord;
    provenance: HistoricalImportProvenance;
  }> = [];
  const pages: HistoricalImportProvenance[] = [];
  let cursor: string | undefined;
  let pageCount = 0;

  do {
    const page = await options.importer.listHistoricalMarkets(
      seriesTicker,
      undefined,
      {
        limit: pageSize,
        ...(cursor ? { cursor } : {}),
      },
    );

    pageCount += 1;
    pages.push({ ...page.provenance });
    for (const market of page.markets) {
      markets.push({
        market,
        provenance: { ...page.provenance },
      });
    }
    cursor = page.cursor.trim() ? page.cursor : undefined;
  } while (cursor);

  return { markets, pages, pageCount };
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
  const { markets, pages, pageCount } = await listAllHistoricalMarkets(
    seriesTicker,
    options,
  );

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

  return deepFreeze({
    metadata: {
      seriesTicker,
      discoveredAt,
      marketCount: normalizedMarkets.length,
      pageCount,
      ...(hasMarketDiscoverySamplingOptions(input.sampling)
        ? { sampling: samplingResult.summary }
        : {}),
    },
    markets: normalizedMarkets,
    validation,
    provenance: {
      pages,
    },
  });
}

export { serializeMarketDiscoveryResult };
