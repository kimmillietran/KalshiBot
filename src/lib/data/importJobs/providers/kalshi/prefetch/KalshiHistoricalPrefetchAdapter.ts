import type {
  HistoricalCandlestickInterval,
  HistoricalCandlesticksResult,
  HistoricalDateRange,
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
  const { importer, marketTicker, startTime, endTime, listMarketWire } = input;
  const dateRange = toHistoricalDateRange(startTime, endTime);
  const fetchOptions = listMarketWire ? { listMarketWire } : undefined;

  const [market, candlesticks, settlementResult] = await Promise.all([
    importer.getHistoricalMarket(marketTicker, fetchOptions),
    importer.getMarketCandlesticks(marketTicker, CANDLESTICK_INTERVAL, dateRange),
    importer.getSettlementResult(marketTicker, fetchOptions),
  ]);

  const state: PrefetchedKalshiHistoricalBronzeState = deepFreeze({
    marketTicker,
    dateRange,
    market,
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
  const {
    importer,
    marketTicker,
    startTime,
    endTime,
    collectionTime,
    observedAt,
    listMarketWire,
  } = input;
  const bronzeImporter = await prefetchKalshiHistoricalBronzeImporter({
    importer,
    marketTicker,
    startTime,
    endTime,
    listMarketWire,
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
