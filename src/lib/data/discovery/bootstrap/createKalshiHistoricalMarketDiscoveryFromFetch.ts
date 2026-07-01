import {
  KalshiHistoricalHttpAdapter,
  KalshiHistoricalImporter,
  type FetchLike,
} from "@/lib/data/importers/kalshi";

import type { KalshiHistoricalMarketDiscoveryOptions } from "../KalshiHistoricalMarketDiscovery";

export function createKalshiHistoricalMarketDiscoveryFromFetch(
  fetchImpl: FetchLike,
  options?: {
    now?: () => Date;
    pageSize?: number;
  },
): KalshiHistoricalMarketDiscoveryOptions {
  const httpAdapter = new KalshiHistoricalHttpAdapter({ fetchImpl });
  const importer = new KalshiHistoricalImporter({
    httpClient: httpAdapter,
    now: options?.now,
  });

  return {
    importer,
    pageSize: options?.pageSize,
    now: options?.now,
  };
}
