export const KALSHI_REST_ENDPOINTS = {
  market: (marketTicker: string) => `/markets/${encodeURIComponent(marketTicker)}`,
} as const;

export function buildKalshiRestMarketPath(marketTicker: string): string {
  return KALSHI_REST_ENDPOINTS.market(marketTicker);
}
