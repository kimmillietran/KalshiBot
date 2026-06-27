export type PriceDirection = "up" | "down" | "flat";

export type BtcFeedStatus = "loading" | "live" | "stale" | "error" | "fallback";

export type BtcPrice = {
  price: number;
  change24h: number;
  change24hPercent: number;
  lastUpdated: Date;
};

export type BtcCandle = {
  timestamp: number;
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
};

export type BtcChartPoint = {
  time: string;
  price: number;
  /** Unix ms from upstream candle when available — used by engine snapshot mapping. */
  timestamp?: number;
};

export type BtcPriceResponse = {
  price: number;
  change24h: number;
  change24hPercent: number;
  updatedAt: string;
};

export type BtcCandlesResponse = {
  candles: BtcCandle[];
};

export type BtcFeedState = {
  price: number;
  change24h: number;
  change24hPercent: number;
  lastUpdated: Date | null;
  chartPoints: BtcChartPoint[];
  /** Upstream OHLC candles for engine snapshot mapping. */
  candles: readonly BtcCandle[];
  status: BtcFeedStatus;
  direction: PriceDirection;
  errorMessage: string | null;
  isUsingFallback: boolean;
  targetPrice: number;
  distanceFromTarget: number;
  distancePercent: number;
  isAboveTarget: boolean;
};
