import type { DiscoveredMarket } from "@/lib/data/discovery/discoveryTypes";
import type {
  HistoricalImportProvenance,
  HistoricalMarketRecord,
} from "./kalshiHistoricalTypes";

import {
  findMissingKalshiMarketWireFields,
  type KalshiMarketWireShape,
} from "./kalshiMarketImportDiagnostics";

export const KALSHI_DISCOVERY_LIST_MARKET_METADATA_KEY = "kalshiDiscoveryListMarket";
export const KALSHI_DISCOVERY_LIST_MARKET_PROVENANCE_METADATA_KEY =
  "kalshiDiscoveryListMarketProvenance";
export const KALSHI_SCHEMA_RECONCILIATION_METADATA_KEY = "kalshiSchemaReconciliation";

export const KALSHI_MARKET_SCHEMA_RECONCILIATION_FIELDS = [
  "ticker",
  "event_ticker",
  "status",
  "open_time",
  "close_time",
  "settlement_ts",
  "expiration_value",
  "series_ticker",
] as const;

export type KalshiMarketSchemaReconciliationResult = {
  mergedWire: KalshiMarketWireShape;
  mergedFields: readonly string[];
  detailMissingRequiredFields: readonly string[];
  listMissingRequiredFields: readonly string[];
};

export type KalshiSchemaReconciliationMetadata = {
  mergedFields: readonly string[];
  listRequestPath: string;
  detailRequestPath: string;
  reconciledAt: string;
};

function wireFieldPresent(wire: KalshiMarketWireShape, field: string): boolean {
  const value = wire[field as keyof KalshiMarketWireShape];
  if (typeof value === "string") {
    return value.trim().length > 0;
  }

  return value !== null && value !== undefined;
}

/** Maps a discovered market record into a Kalshi list-endpoint wire snapshot. */
export function discoveredMarketToKalshiListWireShape(
  market: Pick<
    DiscoveredMarket,
    | "marketTicker"
    | "eventTicker"
    | "seriesTicker"
    | "status"
    | "openTime"
    | "closeTime"
    | "settlementTime"
    | "expirationValue"
    | "title"
    | "subtitle"
  >,
): KalshiMarketWireShape {
  const wire: KalshiMarketWireShape = {
    ticker: market.marketTicker,
    event_ticker: market.eventTicker,
    series_ticker: market.seriesTicker,
    status: market.status,
  };

  if (market.openTime) {
    wire.open_time = market.openTime;
  }

  if (market.closeTime) {
    wire.close_time = market.closeTime;
  }

  if (market.settlementTime) {
    wire.settlement_ts = market.settlementTime;
  }

  if (market.expirationValue) {
    wire.expiration_value = market.expirationValue;
  }

  if (market.title) {
    wire.title = market.title;
  }

  if (market.subtitle) {
    wire.subtitle = market.subtitle;
  }

  return wire;
}

/** Maps a parsed historical list market record into a list-endpoint wire snapshot. */
export function historicalMarketRecordToKalshiListWireShape(
  record: HistoricalMarketRecord,
): KalshiMarketWireShape {
  const wire: KalshiMarketWireShape = {
    ticker: record.ticker,
    event_ticker: record.eventTicker,
    status: record.status,
    result: record.result,
    open_time: record.openTime,
    close_time: record.closeTime,
  };

  if (record.settlementTs) {
    wire.settlement_ts = record.settlementTs;
  }

  if (record.settlementValueDollars) {
    wire.settlement_value_dollars = record.settlementValueDollars;
  }

  if (record.expirationValue?.trim()) {
    wire.expiration_value = record.expirationValue;
  }

  if (record.floorStrike !== null && record.floorStrike !== undefined) {
    wire.floor_strike = record.floorStrike;
  }

  if (record.title) {
    wire.title = record.title;
  }

  if (record.subtitle) {
    wire.subtitle = record.subtitle;
  }

  if (record.seriesTicker) {
    wire.series_ticker = record.seriesTicker;
  }

  return wire;
}

/**
 * Fills absent detail-endpoint fields from a discovery list payload.
 * Detail values always win when both endpoints return a non-empty value.
 */
export function mergeKalshiMarketWireFromListDetail(input: {
  listMarket?: KalshiMarketWireShape | null;
  detailMarket: KalshiMarketWireShape;
}): KalshiMarketSchemaReconciliationResult {
  const listMarket = input.listMarket ?? {};
  const mergedWire: KalshiMarketWireShape = { ...input.detailMarket };
  const mergedFields: string[] = [];

  for (const field of KALSHI_MARKET_SCHEMA_RECONCILIATION_FIELDS) {
    if (wireFieldPresent(mergedWire, field)) {
      continue;
    }

    const listValue = listMarket[field as keyof KalshiMarketWireShape];
    if (typeof listValue === "string") {
      if (!listValue.trim()) {
        continue;
      }

      (mergedWire as Record<string, unknown>)[field] = listValue;
      mergedFields.push(field);
      continue;
    }

    if (listValue !== null && listValue !== undefined) {
      (mergedWire as Record<string, unknown>)[field] = listValue;
      mergedFields.push(field);
    }
  }

  return {
    mergedWire,
    mergedFields,
    detailMissingRequiredFields: findMissingKalshiMarketWireFields(input.detailMarket),
    listMissingRequiredFields: findMissingKalshiMarketWireFields(listMarket),
  };
}

export function readKalshiDiscoveryListMarketFromMetadata(
  metadata: Readonly<Record<string, unknown>>,
): KalshiMarketWireShape | null {
  const value = metadata[KALSHI_DISCOVERY_LIST_MARKET_METADATA_KEY];
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as KalshiMarketWireShape;
}

export function readKalshiDiscoveryListMarketProvenanceFromMetadata(
  metadata: Readonly<Record<string, unknown>>,
): HistoricalImportProvenance | null {
  const value = metadata[KALSHI_DISCOVERY_LIST_MARKET_PROVENANCE_METADATA_KEY];
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as HistoricalImportProvenance;
}

export function buildKalshiSchemaReconciliationMetadata(input: {
  mergedFields: readonly string[];
  listRequestPath: string;
  detailRequestPath: string;
  reconciledAt: string;
}): KalshiSchemaReconciliationMetadata {
  return {
    mergedFields: [...input.mergedFields],
    listRequestPath: input.listRequestPath,
    detailRequestPath: input.detailRequestPath,
    reconciledAt: input.reconciledAt,
  };
}
