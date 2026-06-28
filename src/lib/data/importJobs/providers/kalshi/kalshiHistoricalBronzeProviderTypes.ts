import type {
  HistoricalCandlesticksResult,
  HistoricalDateRange,
  HistoricalMarketRecord,
  HistoricalSettlementResult,
} from "@/lib/data/importers/kalshi/kalshiHistoricalTypes";

import type { HistoricalBronzeProviderImportInput } from "../../historicalBronzeImportJobTypes";

/**
 * Synchronous port mirroring the Kalshi historical importer subset required
 * for bronze import. Production callers adapt pre-fetched importer results.
 */
export type KalshiHistoricalBronzeImporter = {
  getMarketByTicker(
    ticker: string,
    dateRange: HistoricalDateRange,
  ): HistoricalMarketRecord | null;

  getMarketCandlesticks(
    ticker: string,
    dateRange: HistoricalDateRange,
  ): HistoricalCandlesticksResult;

  getSettlementResult(ticker: string): HistoricalSettlementResult | null;
};

export type CreateKalshiHistoricalBronzeProviderInput = {
  importer: KalshiHistoricalBronzeImporter;
  collectionTime: string;
  observedAt: string;
};

export type KalshiHistoricalBronzeProviderContext = {
  collectionTime: string;
  observedAt: string;
};

export type KalshiHistoricalBronzeProviderMethodInput =
  HistoricalBronzeProviderImportInput;
