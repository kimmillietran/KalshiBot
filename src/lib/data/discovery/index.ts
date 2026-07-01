export {
  DEFAULT_KXBTC15M_SERIES_TICKER,
  MarketDiscoveryError,
  MarketDiscoveryErrorCode,
} from "./discoveryTypes";
export type {
  DiscoveredMarket,
  MarketDiscoveryMetadata,
  MarketDiscoveryProvenance,
  MarketDiscoveryResult,
  MarketDiscoveryValidationIssue,
  MarketDiscoveryValidationResult,
} from "./discoveryTypes";

export {
  discoverKalshiHistoricalMarkets,
  serializeMarketDiscoveryResult,
} from "./KalshiHistoricalMarketDiscovery";
export type {
  DiscoverKalshiHistoricalMarketsInput,
  KalshiHistoricalMarketDiscoveryOptions,
} from "./KalshiHistoricalMarketDiscovery";

export { normalizeDiscoveredMarket } from "./normalizeDiscoveredMarket";
export type { NormalizeDiscoveredMarketInput } from "./normalizeDiscoveredMarket";
export { SUPPORTED_DISCOVERY_MARKET_STATUSES } from "./normalizeDiscoveredMarket";

export { validateMarketDiscoveryResult } from "./validateMarketDiscoveryResult";

export { createKalshiHistoricalMarketDiscoveryFromFetch } from "./bootstrap/createKalshiHistoricalMarketDiscoveryFromFetch";
