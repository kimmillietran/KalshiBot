import type { HistoricalMarketRecord } from "@/lib/data/importers/kalshi/kalshiHistoricalTypes";
import { historicalMarketRecordToKalshiListWireShape } from "@/lib/data/importers/kalshi/kalshiMarketSchemaReconciliation";
import { isUtcIsoTimestamp } from "@/lib/data/timestamps";

import type { DiscoveredMarket, MarketDiscoveryProvenance } from "./discoveryTypes";

export const SUPPORTED_DISCOVERY_MARKET_STATUSES = new Set([
  "active",
  "closed",
  "finalized",
  "inactive",
  "open",
  "settled",
  "unopened",
]);

function normalizeOptionalTimestamp(
  raw: string | null | undefined,
): string | null {
  if (raw === null || raw === undefined) {
    return null;
  }

  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }

  const parsedMs = Date.parse(trimmed);
  if (!Number.isFinite(parsedMs)) {
    return trimmed;
  }

  const normalized = new Date(parsedMs).toISOString();
  return isUtcIsoTimestamp(normalized) ? normalized : trimmed;
}

function resolveSeriesTicker(
  configuredSeriesTicker: string,
  market: HistoricalMarketRecord,
): string {
  if (market.seriesTicker?.trim()) {
    return market.seriesTicker.trim();
  }

  const eventTicker = market.eventTicker.trim();
  if (eventTicker) {
    const [series] = eventTicker.split("-");
    if (series) {
      return series;
    }
  }

  const [fromTicker] = market.ticker.split("-");
  if (fromTicker) {
    return fromTicker;
  }

  return configuredSeriesTicker;
}

export type NormalizeDiscoveredMarketInput = {
  seriesTicker: string;
  market: HistoricalMarketRecord;
  provenance: MarketDiscoveryProvenance;
};

/** Maps a historical market record into stable discovery JSON. */
export function normalizeDiscoveredMarket(
  input: NormalizeDiscoveredMarketInput,
): DiscoveredMarket {
  const { market, provenance, seriesTicker } = input;

  return {
    marketTicker: market.ticker.trim(),
    eventTicker: market.eventTicker.trim(),
    seriesTicker: resolveSeriesTicker(seriesTicker, market),
    title: market.title?.trim() || null,
    subtitle: market.subtitle?.trim() || null,
    status: market.status.trim().toLowerCase(),
    openTime: normalizeOptionalTimestamp(market.openTime),
    closeTime: normalizeOptionalTimestamp(market.closeTime),
    settlementTime: normalizeOptionalTimestamp(market.settlementTs),
    expirationValue: market.expirationValue?.trim() || null,
    listMarketWire: historicalMarketRecordToKalshiListWireShape(market),
    provenance: { ...provenance },
  };
}
