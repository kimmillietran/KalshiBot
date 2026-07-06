import type { ExpansionDiscoveredMarket } from "../expansionExecutorTypes";

const REQUIRED_WIRE_FIELDS = [
  "ticker",
  "expiration_value",
  "open_time",
  "close_time",
] as const;

/** Ensures cached discovery records retain raw list-market wire fields. */
export function validateExpansionDiscoveredMarketWire(
  market: ExpansionDiscoveredMarket,
): string | null {
  if (!market.marketTicker.trim()) {
    return "missing marketTicker";
  }

  const wire = market.listMarketWire;
  if (!wire || typeof wire !== "object") {
    return `missing listMarketWire for ${market.marketTicker}`;
  }

  for (const field of REQUIRED_WIRE_FIELDS) {
    const value = wire[field];
    if (value === undefined || value === null || value === "") {
      return `missing listMarketWire.${field} for ${market.marketTicker}`;
    }
  }

  return null;
}

/** Validates every market in a discovery cache segment. */
export function validateExpansionDiscoveredMarkets(
  markets: readonly ExpansionDiscoveredMarket[],
): string | null {
  if (markets.length === 0) {
    return "discovery cache segment has no markets";
  }

  for (const market of markets) {
    const issue = validateExpansionDiscoveredMarketWire(market);
    if (issue) {
      return issue;
    }
  }

  return null;
}
