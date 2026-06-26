export type ActiveBtcMarket = {
  ticker: string;
  title: string;
  targetPrice: number | null;
  status: string;
  openTime: string | null;
  closeTime: string | null;
  timeRemainingMs: number;
  updatedAt: string;
  source: "kalshi";
  isFallback: boolean;
};

export type ActiveBtcMarketApiResponse = {
  market: ActiveBtcMarket | null;
  noMarket: boolean;
  message?: string;
};

export type MarketDataStatus =
  | "loading"
  | "live"
  | "stale"
  | "fallback"
  | "no-market";

export type MarketDataState = {
  market: ActiveBtcMarket | null;
  noMarket: boolean;
  feedStatus: MarketDataStatus;
  errorMessage: string | null;
  isFallback: boolean;
  targetPrice: number;
  timeRemainingMs: number;
  lastFetchedAt: Date | null;
};
