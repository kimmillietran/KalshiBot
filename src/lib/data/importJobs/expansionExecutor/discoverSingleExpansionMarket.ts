import type { KalshiHistoricalMarketDiscoveryOptions } from "@/lib/data/discovery/KalshiHistoricalMarketDiscovery";
import {
  fetchDiscoveryPageWithRetry,
  parseMarketDiscoveryRateLimitOptions,
} from "@/lib/data/discovery/discoveryRateLimit";
import { normalizeDiscoveredMarket } from "@/lib/data/discovery/normalizeDiscoveredMarket";

import type { ExpansionDiscoveredMarket } from "./expansionExecutorTypes";
import { mapDiscoveredMarketToExpansionMarket } from "./mapDiscoveredMarketToExpansionMarket";

const DEFAULT_PAGE_SIZE = 100;

export type DiscoverSingleExpansionMarketResult = {
  market: ExpansionDiscoveredMarket;
  pagesFetched: number;
};

/**
 * Discovers one expansion market via the same list-endpoint normalization path as
 * full-window discovery, paginating only until the target ticker is found.
 */
export async function discoverSingleExpansionMarket(
  input: { marketTicker: string; seriesTicker: string },
  options: KalshiHistoricalMarketDiscoveryOptions,
): Promise<DiscoverSingleExpansionMarketResult | null> {
  const pageSize = options.pageSize ?? DEFAULT_PAGE_SIZE;
  const rateLimit = parseMarketDiscoveryRateLimitOptions(options.rateLimit);
  let cursor: string | undefined;
  let pagesFetched = 0;

  while (true) {
    pagesFetched += 1;
    const page = await fetchDiscoveryPageWithRetry({
      fetchPage: () =>
        options.importer.listHistoricalMarkets(input.seriesTicker, undefined, {
          limit: pageSize,
          cursor,
        }),
      rateLimit,
      logWarning: options.logRateLimitWarning,
      sleep: options.sleep,
    });

    const match = page.markets.find((market) => market.ticker === input.marketTicker);
    if (match) {
      const discovered = normalizeDiscoveredMarket({
        seriesTicker: input.seriesTicker,
        market: match,
        provenance: page.provenance,
      });

      return {
        market: mapDiscoveredMarketToExpansionMarket(discovered),
        pagesFetched,
      };
    }

    if (!page.cursor?.trim()) {
      return null;
    }

    cursor = page.cursor;
  }
}
