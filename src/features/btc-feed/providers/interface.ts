/** Supported candle intervals — extend when adding providers. */
export type BtcCandleInterval = "1m";

export type BtcProviderPrice = {
  price: number;
  change24h: number;
  change24hPercent: number;
  updatedAt: string;
};

export type BtcProviderCandle = {
  timestamp: number;
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
};

/**
 * Minimal BTC market-data contract. Consumers outside `providers/` must depend
 * only on this interface (via server/BFF), never on vendor URLs or payloads.
 */
export interface BtcPriceProvider {
  readonly id: string;
  getCurrentPrice(): Promise<BtcProviderPrice>;
  getCandles(interval: BtcCandleInterval, limit: number): Promise<BtcProviderCandle[]>;
}
