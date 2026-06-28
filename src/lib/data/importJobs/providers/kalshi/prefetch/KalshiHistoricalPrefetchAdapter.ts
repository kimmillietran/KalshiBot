import type {
  HistoricalCandlestickInterval,
  HistoricalCandlesticksResult,
  HistoricalDateRange,
  HistoricalMarketRecord,
  HistoricalMarketsPage,
  HistoricalSettlementResult,
} from "@/lib/data/importers/kalshi/kalshiHistoricalTypes";

import { createKalshiHistoricalBronzeProvider } from "../KalshiHistoricalBronzeProvider";
import type { KalshiHistoricalBronzeImporter } from "../kalshiHistoricalBronzeProviderTypes";
import type {
  CreatePrefetchedKalshiHistoricalBronzeProviderInput,
  PrefetchKalshiHistoricalBronzeImporterInput,
  PrefetchedKalshiHistoricalBronzeState,
} from "./kalshiPrefetchAdapterTypes";

const CANDLESTICK_INTERVAL: HistoricalCandlestickInterval = 1;

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

function toHistoricalDateRange(
  startTime: string,
  endTime: string,
): HistoricalDateRange {
  return {
    startTs: Math.floor(Date.parse(startTime) / 1000),
    endTs: Math.floor(Date.parse(endTime) / 1000),
  };
}

function deriveSeriesTicker(marketTicker: string): string {
  const dashIndex = marketTicker.indexOf("-");
  if (dashIndex <= 0) {
    return marketTicker;
  }

  return marketTicker.slice(0, dashIndex);
}

function findMarketByTicker(
  page: HistoricalMarketsPage,
  ticker: string,
): HistoricalMarketRecord | null {
  return page.markets.find((market) => market.ticker === ticker) ?? null;
}

function normalizeSettlement(
  settlement: HistoricalSettlementResult,
): HistoricalSettlementResult | null {
  if (!settlement.settlementTs?.trim() || !settlement.expirationValue.trim()) {
    return null;
  }

  return settlement;
}

function emptyCandlesticksResult(ticker: string): HistoricalCandlesticksResult {
  return {
    ticker,
    interval: CANDLESTICK_INTERVAL,
    candlesticks: [],
    provenance: {
      source: "kalshi-historical-api",
      fetchedAt: "",
      requestPath: "",
    },
  };
}

function createSyncImporter(
  state: PrefetchedKalshiHistoricalBronzeState,
): KalshiHistoricalBronzeImporter {
  return Object.freeze({
    getMarketByTicker: (ticker: string, dateRange: HistoricalDateRange) => {
      void dateRange;
      if (ticker !== state.marketTicker) {
        return null;
      }

      return state.market;
    },

    getMarketCandlesticks: (ticker: string, dateRange: HistoricalDateRange) => {
      void dateRange;
      if (ticker !== state.marketTicker) {
        return emptyCandlesticksResult(ticker);
      }

      return state.candlesticks;
    },

    getSettlementResult: (ticker: string) => {
      if (ticker !== state.marketTicker) {
        return null;
      }

      return state.settlement;
    },
  });
}

/**
 * Prefetches Kalshi historical market, candlestick, and settlement data once
 * via the async importer, then exposes a synchronous bronze importer port.
 */
export async function prefetchKalshiHistoricalBronzeImporter(
  input: PrefetchKalshiHistoricalBronzeImporterInput,
): Promise<KalshiHistoricalBronzeImporter> {
  const { importer, marketTicker, startTime, endTime } = input;
  const dateRange = toHistoricalDateRange(startTime, endTime);
  const seriesTicker = deriveSeriesTicker(marketTicker);

  const [marketsPage, candlesticks, settlementResult] = await Promise.all([
    importer.listHistoricalMarkets(seriesTicker, dateRange),
    importer.getMarketCandlesticks(marketTicker, CANDLESTICK_INTERVAL, dateRange),
    importer.getSettlementResult(marketTicker),
  ]);

  const state: PrefetchedKalshiHistoricalBronzeState = deepFreeze({
    marketTicker,
    dateRange,
    market: findMarketByTicker(marketsPage, marketTicker),
    candlesticks,
    settlement: normalizeSettlement(settlementResult),
  });

  return createSyncImporter(state);
}

/**
 * Prefetches Kalshi historical data and returns a bronze provider ready for
 * {@link runHistoricalBronzeImportJob}.
 */
export async function createPrefetchedKalshiHistoricalBronzeProvider(
  input: CreatePrefetchedKalshiHistoricalBronzeProviderInput,
) {
  const { importer, marketTicker, startTime, endTime, collectionTime, observedAt } = input;
  const bronzeImporter = await prefetchKalshiHistoricalBronzeImporter({
    importer,
    marketTicker,
    startTime,
    endTime,
  });

  return createKalshiHistoricalBronzeProvider({
    importer: bronzeImporter,
    collectionTime,
    observedAt,
  });
}

export type {
  CreatePrefetchedKalshiHistoricalBronzeProviderInput,
  PrefetchKalshiHistoricalBronzeImporterInput,
  PrefetchedKalshiHistoricalBronzeState,
} from "./kalshiPrefetchAdapterTypes";
