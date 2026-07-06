import type { ExpansionDiscoveredMarket } from "../expansionExecutorTypes";

/** Merges segment discovery results, deduping by ticker and preserving deterministic order. */
export function mergeExpansionDiscoveredMarkets(
  segments: readonly (readonly ExpansionDiscoveredMarket[])[],
): ExpansionDiscoveredMarket[] {
  const byTicker = new Map<string, ExpansionDiscoveredMarket>();

  for (const segment of segments) {
    for (const market of segment) {
      byTicker.set(market.marketTicker, market);
    }
  }

  return [...byTicker.values()].sort((left, right) => {
    const byOpenTime = (left.openTime ?? "").localeCompare(right.openTime ?? "");
    if (byOpenTime !== 0) {
      return byOpenTime;
    }

    return left.marketTicker.localeCompare(right.marketTicker);
  });
}
