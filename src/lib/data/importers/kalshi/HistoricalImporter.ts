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
import type { KalshiMarketWireShape } from "./kalshiMarketImportDiagnostics";
import type { KalshiHistoricalMarketReconciliationTraceHooks } from "./kalshiMarketReconciliationTraceHooks";

export type KalshiHistoricalMarketFetchOptions = {
  listMarketWire?: KalshiMarketWireShape | null;
  reconciliationTrace?: KalshiHistoricalMarketReconciliationTraceHooks;
};

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

  getHistoricalMarket(
    ticker: string,
    options?: KalshiHistoricalMarketFetchOptions,
  ): Promise<HistoricalMarketRecord | null>;

  getSettlementResult(
    ticker: string,
    options?: KalshiHistoricalMarketFetchOptions,
  ): Promise<HistoricalSettlementResult>;
}
