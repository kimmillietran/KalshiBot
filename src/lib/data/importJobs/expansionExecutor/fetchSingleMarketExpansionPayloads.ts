import {
  buildHistoricalMarketPath,
  buildHistoricalMarketsPath,
  DEFAULT_KALSHI_HISTORICAL_API_BASE,
  KalshiHistoricalHttpAdapter,
  KalshiHistoricalImporter,
  type FetchLike,
  type KalshiHistoricalHttpClient,
} from "@/lib/data/importers/kalshi";
import type { KalshiMarketWireShape } from "@/lib/data/importers/kalshi/kalshiMarketImportDiagnostics";
import type { HistoricalImportProvenance } from "@/lib/data/importers/kalshi/kalshiHistoricalTypes";

import type {
  FetchedSingleMarketDetailWire,
  FetchedSingleMarketListWire,
  SingleMarketExpansionImportDebugDeps,
} from "./singleMarketExpansionImportDebugTypes";

const SINGLE_MARKET_LIST_PAGE_LIMIT = 100;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function buildProvenance(
  requestPath: string,
  fetchedAt: string,
  cursor?: string,
): HistoricalImportProvenance {
  return {
    source: "kalshi-historical-api",
    fetchedAt,
    requestPath,
    ...(cursor ? { cursor } : {}),
  };
}

/** Derives the series ticker prefix from a Kalshi market ticker. */
export function resolveSeriesTickerFromMarketTicker(marketTicker: string): string {
  const trimmed = marketTicker.trim();
  const [series] = trimmed.split("-");
  return series?.trim() || trimmed;
}

export async function fetchSingleMarketListWire(
  httpClient: KalshiHistoricalHttpClient,
  baseUrl: string,
  input: { marketTicker: string; seriesTicker: string },
  fetchedAt: string,
): Promise<FetchedSingleMarketListWire> {
  const requestPath = buildHistoricalMarketsPath(input.seriesTicker, undefined, {
    limit: SINGLE_MARKET_LIST_PAGE_LIMIT,
  });
  const { status, body } = await httpClient.get(`${baseUrl}${requestPath}`);

  if (status === 404) {
    return {
      wire: null,
      requestPath,
      provenance: null,
      unavailableReason: "List endpoint returned 404",
    };
  }

  if (status < 200 || status >= 300) {
    return {
      wire: null,
      requestPath,
      provenance: null,
      unavailableReason: `List endpoint returned HTTP ${status}`,
    };
  }

  if (!isRecord(body) || !Array.isArray(body.markets)) {
    return {
      wire: null,
      requestPath,
      provenance: null,
      unavailableReason: "List endpoint response is missing markets array",
    };
  }

  const cursor = typeof body.cursor === "string" ? body.cursor : undefined;
  const provenance = buildProvenance(requestPath, fetchedAt, cursor);
  const match = body.markets.find((entry) => {
    if (!isRecord(entry)) {
      return false;
    }

    return entry.ticker === input.marketTicker;
  });

  if (!isRecord(match)) {
    return {
      wire: null,
      requestPath,
      provenance,
      unavailableReason:
        "Market not found in first list page (pagination disabled for single-market smoke)",
    };
  }

  return {
    wire: match as KalshiMarketWireShape,
    requestPath,
    provenance,
    unavailableReason: null,
  };
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
  const httpAdapter = new KalshiHistoricalHttpAdapter({ fetchImpl });
  const now = options.now ?? (() => new Date());
  const baseUrl = DEFAULT_KALSHI_HISTORICAL_API_BASE;

  return {
    fetchListMarketWire: async (input) =>
      fetchSingleMarketListWire(httpAdapter, baseUrl, input, now().toISOString()),
    fetchDetailMarketWire: async (marketTicker) =>
      fetchSingleMarketDetailWire(httpAdapter, baseUrl, marketTicker),
    runImport: options.runImport,
  };
}

/** Creates fetch deps backed by KalshiHistoricalImporter for tests that stub importer methods. */
export function createSingleMarketExpansionImportDebugDepsFromImporter(
  importer: KalshiHistoricalImporter,
  options: {
    httpClient: KalshiHistoricalHttpClient;
    baseUrl?: string;
    now?: () => Date;
    runImport: SingleMarketExpansionImportDebugDeps["runImport"];
  },
): SingleMarketExpansionImportDebugDeps {
  const now = options.now ?? (() => new Date());
  const baseUrl = options.baseUrl ?? DEFAULT_KALSHI_HISTORICAL_API_BASE;

  return {
    fetchListMarketWire: async (input) =>
      fetchSingleMarketListWire(
        options.httpClient,
        baseUrl,
        input,
        now().toISOString(),
      ),
    fetchDetailMarketWire: async (marketTicker) =>
      fetchSingleMarketDetailWire(options.httpClient, baseUrl, marketTicker),
    runImport: options.runImport,
  };
}
