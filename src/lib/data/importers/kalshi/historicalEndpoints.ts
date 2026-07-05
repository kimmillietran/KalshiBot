import type {
  HistoricalCandlestickInterval,
  HistoricalDateRange,
  HistoricalPaginationOptions,
} from "./kalshiHistoricalTypes";

export const DEFAULT_KALSHI_HISTORICAL_API_BASE =
  "https://external-api.kalshi.com/trade-api/v2";

export const HISTORICAL_ENDPOINTS = {
  cutoff: "/historical/cutoff",
  markets: "/historical/markets",
  market: (ticker: string) => `/historical/markets/${encodeURIComponent(ticker)}`,
  candlesticks: (ticker: string) =>
    `/historical/markets/${encodeURIComponent(ticker)}/candlesticks`,
  trades: "/historical/trades",
} as const;

function appendQuery(
  params: URLSearchParams,
  key: string,
  value: string | number | undefined,
): void {
  if (value === undefined) {
    return;
  }

  params.set(key, String(value));
}

export function buildHistoricalMarketsPath(
  seriesTicker: string,
  _dateRange?: HistoricalDateRange,
  pagination?: HistoricalPaginationOptions,
): string {
  const params = new URLSearchParams();
  const tickers = pagination?.tickers?.trim();

  if (tickers) {
    params.set("tickers", tickers);
  } else {
    params.set("series_ticker", seriesTicker);
  }

  appendQuery(params, "limit", pagination?.limit);
  appendQuery(params, "cursor", pagination?.cursor);
  const query = params.toString();
  return query ? `${HISTORICAL_ENDPOINTS.markets}?${query}` : HISTORICAL_ENDPOINTS.markets;
}

export function buildHistoricalCandlesticksPath(
  ticker: string,
  interval: HistoricalCandlestickInterval,
  dateRange: HistoricalDateRange,
): string {
  const params = new URLSearchParams();
  params.set("period_interval", String(interval));

  if (dateRange.startTs === undefined || dateRange.endTs === undefined) {
    throw new Error(
      "Historical candlesticks require dateRange.startTs and dateRange.endTs",
    );
  }

  params.set("start_ts", String(dateRange.startTs));
  params.set("end_ts", String(dateRange.endTs));
  return `${HISTORICAL_ENDPOINTS.candlesticks(ticker)}?${params.toString()}`;
}

export function buildHistoricalTradesPath(
  scope: { ticker?: string; seriesTicker?: string },
  dateRange?: HistoricalDateRange,
  pagination?: HistoricalPaginationOptions,
): string {
  const params = new URLSearchParams();

  if (scope.ticker) {
    params.set("ticker", scope.ticker);
  }

  appendQuery(params, "min_ts", dateRange?.startTs);
  appendQuery(params, "max_ts", dateRange?.endTs);
  appendQuery(params, "limit", pagination?.limit);
  appendQuery(params, "cursor", pagination?.cursor);

  const query = params.toString();
  return query ? `${HISTORICAL_ENDPOINTS.trades}?${query}` : HISTORICAL_ENDPOINTS.trades;
}

export function buildHistoricalCutoffPath(): string {
  return HISTORICAL_ENDPOINTS.cutoff;
}

export function buildHistoricalMarketPath(ticker: string): string {
  return HISTORICAL_ENDPOINTS.market(ticker);
}
