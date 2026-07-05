import type { KalshiHistoricalMarketDiscoveryOptions } from "@/lib/data/discovery/KalshiHistoricalMarketDiscovery";
import type { MarketDiscoveryProvenance } from "@/lib/data/discovery/discoveryTypes";
import {
  fetchDiscoveryPageWithRetry,
  parseMarketDiscoveryRateLimitOptions,
} from "@/lib/data/discovery/discoveryRateLimit";
import { normalizeDiscoveredMarket } from "@/lib/data/discovery/normalizeDiscoveredMarket";
import type { DiscoveredMarket } from "@/lib/data/discovery/discoveryTypes";
import type { HistoricalMarketRecord, HistoricalMarketsPage } from "@/lib/data/importers/kalshi/kalshiHistoricalTypes";
import type { KalshiMarketWireShape } from "@/lib/data/importers/kalshi/kalshiMarketImportDiagnostics";

import type { ExpansionDiscoveredMarket } from "./expansionExecutorTypes";
import { mapDiscoveredMarketToExpansionMarket } from "./mapDiscoveredMarketToExpansionMarket";

const DEFAULT_PAGE_SIZE = 100;

export type DiscoverSingleExpansionMarketResult = {
  market: ExpansionDiscoveredMarket;
  pagesFetched: number;
  foundOnPage: number;
  rawMarketRecord: HistoricalMarketRecord;
  normalizedMarket: DiscoveredMarket;
};

async function fetchDiscoveryListPage(
  input: {
    seriesTicker: string;
    marketTicker: string;
    pageSize: number;
    cursor?: string;
    tickers?: string;
  },
  options: KalshiHistoricalMarketDiscoveryOptions,
  rateLimit: ReturnType<typeof parseMarketDiscoveryRateLimitOptions>,
) {
  return fetchDiscoveryPageWithRetry({
    fetchPage: () =>
      options.importer.listHistoricalMarkets(input.seriesTicker, undefined, {
        limit: input.pageSize,
        ...(input.cursor ? { cursor: input.cursor } : {}),
        ...(input.tickers ? { tickers: input.tickers } : {}),
      }),
    rateLimit,
    logWarning: options.logRateLimitWarning,
    sleep: options.sleep,
  });
}

function findMarketOnPage(
  page: HistoricalMarketsPage,
  marketTicker: string,
): {
  market: HistoricalMarketRecord;
  rawListMarketWire: KalshiMarketWireShape | null;
} | null {
  const index = page.markets.findIndex((market) => market.ticker === marketTicker);
  if (index < 0) {
    return null;
  }

  return {
    market: page.markets[index]!,
    rawListMarketWire: (page.rawMarketWires?.[index] ?? null) as KalshiMarketWireShape | null,
  };
}

function buildDiscoveryResult(
  input: {
    seriesTicker: string;
    match: HistoricalMarketRecord;
    rawListMarketWire: KalshiMarketWireShape | null;
    provenance: MarketDiscoveryProvenance;
    foundOnPage: number;
    pagesFetched: number;
  },
): DiscoverSingleExpansionMarketResult {
  const normalized = normalizeDiscoveredMarket({
    seriesTicker: input.seriesTicker,
    market: input.match,
    provenance: input.provenance,
    rawListMarketWire: input.rawListMarketWire,
  });

  return {
    market: mapDiscoveredMarketToExpansionMarket(normalized),
    pagesFetched: input.pagesFetched,
    foundOnPage: input.foundOnPage,
    rawMarketRecord: input.match,
    normalizedMarket: normalized,
  };
}

async function discoverViaTickersFilter(
  input: { marketTicker: string; seriesTicker: string },
  options: KalshiHistoricalMarketDiscoveryOptions,
  pageSize: number,
  rateLimit: ReturnType<typeof parseMarketDiscoveryRateLimitOptions>,
): Promise<DiscoverSingleExpansionMarketResult | null> {
  const page = await fetchDiscoveryListPage(
    {
      seriesTicker: input.seriesTicker,
      marketTicker: input.marketTicker,
      pageSize,
      tickers: input.marketTicker,
    },
    options,
    rateLimit,
  );

  const match = findMarketOnPage(page, input.marketTicker);
  if (!match) {
    return null;
  }

  return buildDiscoveryResult({
    seriesTicker: input.seriesTicker,
    match: match.market,
    rawListMarketWire: match.rawListMarketWire,
    provenance: page.provenance,
    foundOnPage: 1,
    pagesFetched: 1,
  });
}

async function discoverViaPagination(
  input: { marketTicker: string; seriesTicker: string },
  options: KalshiHistoricalMarketDiscoveryOptions,
  pageSize: number,
  rateLimit: ReturnType<typeof parseMarketDiscoveryRateLimitOptions>,
): Promise<DiscoverSingleExpansionMarketResult | null> {
  let cursor: string | undefined;
  let pagesFetched = 0;

  while (true) {
    pagesFetched += 1;
    const page = await fetchDiscoveryListPage(
      {
        seriesTicker: input.seriesTicker,
        marketTicker: input.marketTicker,
        pageSize,
        cursor,
      },
      options,
      rateLimit,
    );

    const match = findMarketOnPage(page, input.marketTicker);
    if (match) {
      return buildDiscoveryResult({
        seriesTicker: input.seriesTicker,
        match: match.market,
        rawListMarketWire: match.rawListMarketWire,
        provenance: page.provenance,
        foundOnPage: pagesFetched,
        pagesFetched,
      });
    }

    if (!page.cursor?.trim()) {
      return null;
    }

    cursor = page.cursor;
  }
}

/**
 * Discovers one expansion market via the historical list endpoint.
 * Uses the tickers filter first (O(1)); paginates only when that filter misses.
 */
export async function discoverSingleExpansionMarket(
  input: { marketTicker: string; seriesTicker: string },
  options: KalshiHistoricalMarketDiscoveryOptions,
): Promise<DiscoverSingleExpansionMarketResult | null> {
  const pageSize = options.pageSize ?? DEFAULT_PAGE_SIZE;
  const rateLimit = parseMarketDiscoveryRateLimitOptions(options.rateLimit);

  const tickerFilterResult = await discoverViaTickersFilter(
    input,
    options,
    pageSize,
    rateLimit,
  );
  if (tickerFilterResult) {
    return tickerFilterResult;
  }

  return discoverViaPagination(input, options, pageSize, rateLimit);
}
