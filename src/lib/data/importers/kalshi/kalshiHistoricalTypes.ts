/** Minimal local types for the 6.1B importer spike (rebase onto Builder #1 contracts later). */

export type HistoricalDateRange = {
  /** Unix timestamp (seconds), inclusive lower bound when the endpoint supports it. */
  startTs?: number;
  /** Unix timestamp (seconds), inclusive upper bound when the endpoint supports it. */
  endTs?: number;
};

export type HistoricalCandlestickInterval = 1 | 60 | 1440;

export type HistoricalPaginationOptions = {
  limit?: number;
  cursor?: string;
  /** Comma-separated market tickers; mutually exclusive with series_ticker on the API. */
  tickers?: string;
};

export type HistoricalImportProvenance = {
  source: "kalshi-historical-api" | "kalshi-rest-api";
  fetchedAt: string;
  requestPath: string;
  cursor?: string | null;
};

export type HistoricalMarketRecord = {
  ticker: string;
  eventTicker: string;
  status: string;
  result: string;
  openTime: string;
  closeTime: string;
  settlementTs: string | null;
  settlementValueDollars: string | null;
  expirationValue: string;
  floorStrike: number | null;
  title?: string | null;
  subtitle?: string | null;
  seriesTicker?: string | null;
};

export type HistoricalMarketsPage = {
  markets: HistoricalMarketRecord[];
  /** Unparsed list-endpoint wire objects from the Kalshi API response. */
  rawMarketWires?: readonly Record<string, unknown>[];
  cursor: string;
  provenance: HistoricalImportProvenance;
};

export type HistoricalCandlestickRecord = {
  endPeriodTs: number;
  volume: string;
  openInterest: string;
  priceClose: string | null;
};

export type HistoricalCandlesticksResult = {
  ticker: string;
  interval: HistoricalCandlestickInterval;
  candlesticks: HistoricalCandlestickRecord[];
  provenance: HistoricalImportProvenance;
};

export type HistoricalTradeRecord = {
  tradeId: string;
  ticker: string;
  countFp: string;
  yesPriceDollars: string;
  noPriceDollars: string;
  createdTime: string;
  isBlockTrade: boolean;
};

export type HistoricalTradesPage = {
  trades: HistoricalTradeRecord[];
  cursor: string;
  provenance: HistoricalImportProvenance;
};

export type HistoricalCutoffTimestamps = {
  marketSettledTs: string;
  tradesCreatedTs: string;
  ordersUpdatedTs: string;
  provenance: HistoricalImportProvenance;
};

export type HistoricalSettlementResult = {
  ticker: string;
  result: string;
  status: string;
  settlementTs: string | null;
  settlementValueDollars: string | null;
  expirationValue: string;
  provenance: HistoricalImportProvenance;
};

export type HistoricalTradesScope = {
  ticker?: string;
  seriesTicker?: string;
};
