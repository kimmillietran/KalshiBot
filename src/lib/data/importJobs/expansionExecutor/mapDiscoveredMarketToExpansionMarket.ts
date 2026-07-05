import type { DiscoveredMarket } from "@/lib/data/discovery";

import type { ExpansionDiscoveredMarket } from "./expansionExecutorTypes";

/** Maps a normalized discovery record into the expansion executor market shape. */
export function mapDiscoveredMarketToExpansionMarket(
  market: DiscoveredMarket,
): ExpansionDiscoveredMarket {
  return {
    marketTicker: market.marketTicker,
    seriesTicker: market.seriesTicker,
    eventTicker: market.eventTicker,
    status: market.status,
    openTime: market.openTime,
    closeTime: market.closeTime,
    settlementTime: market.settlementTime,
    expirationValue: market.expirationValue,
    title: market.title,
    subtitle: market.subtitle,
    listMarketWire: market.listMarketWire,
    provenance: market.provenance,
  };
}
