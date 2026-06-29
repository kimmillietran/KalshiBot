import type {
  HistoricalCandlestickInterval,
  HistoricalCandlesticksResult,
  HistoricalCutoffTimestamps,
  HistoricalDateRange,
  HistoricalMarketRecord,
  HistoricalMarketsPage,
  HistoricalPaginationOptions,
  HistoricalSettlementResult,
  HistoricalTradesPage,
  HistoricalTradesScope,
} from "./kalshiHistoricalTypes";

/** Abstraction for retrieving archived Kalshi exchange data. */
export interface HistoricalImporter {
  listHistoricalMarkets(
    seriesTicker: string,
    dateRange?: HistoricalDateRange,
    pagination?: HistoricalPaginationOptions,
  ): Promise<HistoricalMarketsPage>;

  getMarketCandlesticks(
    ticker: string,
    interval: HistoricalCandlestickInterval,
    dateRange: HistoricalDateRange,
  ): Promise<HistoricalCandlesticksResult>;

  getHistoricalTrades(
    scope: HistoricalTradesScope,
    dateRange?: HistoricalDateRange,
    pagination?: HistoricalPaginationOptions,
  ): Promise<HistoricalTradesPage>;

  getHistoricalCutoff(): Promise<HistoricalCutoffTimestamps>;

  getHistoricalMarket(ticker: string): Promise<HistoricalMarketRecord | null>;

  getSettlementResult(ticker: string): Promise<HistoricalSettlementResult>;
}
