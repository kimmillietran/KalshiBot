import {
  buildHistoricalMarketPath,
  DEFAULT_KALSHI_HISTORICAL_API_BASE,
  KalshiHistoricalHttpAdapter,
  type FetchLike,
  type KalshiHistoricalHttpClient,
} from "@/lib/data/importers/kalshi";
import type { KalshiMarketWireShape } from "@/lib/data/importers/kalshi/kalshiMarketImportDiagnostics";

import { createKalshiHistoricalMarketDiscoveryFromFetch } from "@/lib/data/discovery";

import { discoverSingleExpansionMarket } from "./discoverSingleExpansionMarket";
import type {
  FetchedSingleMarketDetailWire,
  SingleMarketExpansionImportDebugDeps,
} from "./singleMarketExpansionImportDebugTypes";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Derives the series ticker prefix from a Kalshi market ticker. */
export function resolveSeriesTickerFromMarketTicker(marketTicker: string): string {
  const trimmed = marketTicker.trim();
  const [series] = trimmed.split("-");
  return series?.trim() || trimmed;
}

export async function fetchSingleMarketDetailWire(
  httpClient: KalshiHistoricalHttpClient,
  baseUrl: string,
  marketTicker: string,
): Promise<FetchedSingleMarketDetailWire> {
  const requestPath = buildHistoricalMarketPath(marketTicker);
  const { status, body } = await httpClient.get(`${baseUrl}${requestPath}`);

  if (status === 404) {
    return {
      wire: null,
      requestPath,
      httpStatus: status,
      unavailableReason: "Detail endpoint returned 404",
    };
  }

  if (status < 200 || status >= 300) {
    return {
      wire: null,
      requestPath,
      httpStatus: status,
      unavailableReason: `Detail endpoint returned HTTP ${status}`,
    };
  }

  if (!isRecord(body) || !isRecord(body.market)) {
    return {
      wire: null,
      requestPath,
      httpStatus: status,
      unavailableReason: "Detail endpoint response is missing market object",
    };
  }

  return {
    wire: body.market as KalshiMarketWireShape,
    requestPath,
    httpStatus: status,
    unavailableReason: null,
  };
}

export function createSingleMarketExpansionImportDebugDepsFromFetch(
  fetchImpl: FetchLike,
  options: {
    now?: () => Date;
    runImport: SingleMarketExpansionImportDebugDeps["runImport"];
  },
): SingleMarketExpansionImportDebugDeps {
  const discoveryOptions = createKalshiHistoricalMarketDiscoveryFromFetch(fetchImpl);
  const httpAdapter = new KalshiHistoricalHttpAdapter({ fetchImpl });
  const baseUrl = DEFAULT_KALSHI_HISTORICAL_API_BASE;

  return {
    discoverMarket: async (input) =>
      discoverSingleExpansionMarket(input, discoveryOptions),
    fetchDetailMarketWire: async (marketTicker) =>
      fetchSingleMarketDetailWire(httpAdapter, baseUrl, marketTicker),
    runImport: options.runImport,
  };
}
