/**
 * Audit result for Kalshi historical candlestick bid/ask fidelity (milestone 6.25C).
 *
 * The historical candlesticks endpoint exposes trade-price OHLC via `price.close`
 * only. It does not provide separate YES bid OHLC, YES ask OHLC, or historical
 * orderbook snapshots. Bronze preserves the raw wire payload unchanged; silver
 * synthesizes top-of-book quotes from trade close when legacy bid/ask cents are
 * absent.
 */
export const KalshiHistoricalBidAskAuditFinding = {
  HAS_YES_BID_OHLC: false,
  HAS_YES_ASK_OHLC: false,
  HAS_NO_BID_OHLC: false,
  HAS_NO_ASK_OHLC: false,
  HAS_HISTORICAL_ORDERBOOK: false,
  TRADE_PRICE_FIELD: "price.close",
  BRONZE_PRESERVATION: "raw-wire-passthrough",
  SILVER_LIVE_STRATEGY: "synthesize-quotes-from-trade-close",
} as const;

export type KalshiHistoricalBidAskAuditFinding =
  (typeof KalshiHistoricalBidAskAuditFinding)[keyof typeof KalshiHistoricalBidAskAuditFinding];
