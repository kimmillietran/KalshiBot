export enum MarketLifecycle {
  UPCOMING = "UPCOMING",
  ACTIVE = "ACTIVE",
  CLOSED = "CLOSED",
  SETTLED = "SETTLED",
  UNKNOWN = "UNKNOWN",
}

export type LiquidityQuality = "Poor" | "Fair" | "Good" | "Excellent";

export type ContractSidePricing = {
  bidCents: number | null;
  askCents: number | null;
  midCents: number | null;
  lastCents: number | null;
  spreadCents: number | null;
};

export type MarketContractPricing = {
  yes: ContractSidePricing;
  no: ContractSidePricing;
  volumeLabel: string;
  liquidityQuality: LiquidityQuality;
  updatedAt: string;
  isFallback: boolean;
  source: "kalshi";
};

export type ActiveBtcMarket = {
  ticker: string;
  title: string;
  targetPrice: number | null;
  lifecycle: MarketLifecycle;
  openTime: string | null;
  closeTime: string | null;
  timeRemainingMs: number;
  updatedAt: string;
  source: "kalshi";
  isFallback: boolean;
};

export type ActiveBtcMarketApiResponse = {
  market: ActiveBtcMarket | null;
  pricing: MarketContractPricing | null;
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
  pricing: MarketContractPricing | null;
  noMarket: boolean;
  feedStatus: MarketDataStatus;
  errorMessage: string | null;
  isFallback: boolean;
  targetPrice: number;
  timeRemainingMs: number;
  lastFetchedAt: Date | null;
};
