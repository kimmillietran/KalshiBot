import type { BtcHistoricalInterval } from "../btcHistoricalImporterTypes";

/** Coinbase Exchange public REST base (no API key). */
export const DEFAULT_COINBASE_EXCHANGE_API_BASE =
  "https://api.exchange.coinbase.com";

export const COINBASE_HISTORICAL_PRODUCT_ID = "BTC-USD";

export const COINBASE_MAX_CANDLES_PER_REQUEST = 300;

export const COINBASE_CANDLE_FIELD_COUNT = 6;

export type CoinbaseHistoricalHttpFetchCandlesInput = {
  productId: string;
  granularity: number;
  startTime: string;
  endTime: string;
};

export type CoinbaseHistoricalHttpClient = {
  fetchCandles: (
    input: CoinbaseHistoricalHttpFetchCandlesInput,
  ) => Promise<unknown>;
};

export type CreateCoinbaseHistoricalImporterInput = {
  httpClient: CoinbaseHistoricalHttpClient;
};

export const COINBASE_INTERVAL_GRANULARITY: Record<BtcHistoricalInterval, number> = {
  "1m": 60,
};
