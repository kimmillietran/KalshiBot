import type { NormalizedVendorSampleRow } from "@/lib/data/research/vendorOrderbookSufficiencyAudit/parseVendorSample";

import type { VendorSchemaDetection } from "./vendorSampleIntakeTypes";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const TIMESTAMP_KEYS = [
  "timestampMs",
  "timestamp",
  "ts",
  "observedAt",
  "eventTime",
  "exchangeTimestampMs",
  "exchange_timestamp",
  "vendorReceiveTimestampMs",
  "vendor_receive_timestamp",
  "received_at",
];

const MARKET_KEYS = [
  "marketTicker",
  "market_ticker",
  "ticker",
  "market",
  "contract_ticker",
  "predexon_market_id",
  "allium_symbol",
  "symbol",
];
const SERIES_KEYS = ["seriesTicker", "series_ticker", "series"];
const EVENT_KEYS = ["eventTicker", "event_ticker", "event"];
const STRIKE_KEYS = ["floorStrike", "floor_strike", "strike", "strikePriceUsd"];
const YES_BID_KEYS = ["yesBidCents", "yes_bid", "yes_bid_cents", "yesBid", "bid"];
const YES_ASK_KEYS = ["yesAskCents", "yes_ask", "yes_ask_cents", "yesAsk", "ask"];
const NO_BID_KEYS = ["noBidCents", "no_bid", "no_bid_cents", "noBid"];
const NO_ASK_KEYS = ["noAskCents", "no_ask", "no_ask_cents", "noAsk"];
const SIZE_KEYS = [
  "yesBidSize",
  "yesAskSize",
  "noBidSize",
  "noAskSize",
  "yes_bid_size",
  "yes_ask_size",
  "bid_size",
  "ask_size",
  "size",
  "quantity",
];
const TRADE_KEYS = ["tradePriceCents", "trade_price", "tradeSize", "trade_size", "price"];
const SEQUENCE_KEYS = ["sequenceOrUpdateId", "sequence", "seq", "update_id", "updateId"];

function keysPresentInRawRecords(
  records: readonly Record<string, unknown>[],
  candidateKeys: readonly string[],
): string[] {
  const found = new Set<string>();

  for (const record of records) {
    for (const key of candidateKeys) {
      if (key in record && record[key] !== null && record[key] !== undefined && record[key] !== "") {
        found.add(key);
      }
    }
  }

  return [...found].sort();
}

function inferSnapshotHint(records: readonly Record<string, unknown>[]): VendorSchemaDetection["snapshotVsDeltaHint"] {
  const hasDelta = records.some(
    (record) =>
      "delta" in record
      || "updateType" in record
      || "changeType" in record
      || record.type === "delta",
  );
  const hasSnapshot = records.some(
    (record) =>
      "snapshot" in record
      || record.type === "snapshot"
      || "orderbook" in record
      || "book" in record,
  );

  if (hasDelta && hasSnapshot) {
    return "mixed";
  }

  if (hasDelta) {
    return "delta";
  }

  if (hasSnapshot) {
    return "snapshot";
  }

  return "unknown";
}

/** Infers schema fields from raw vendor sample records. */
export function inferVendorSampleSchema(
  rawRecords: readonly Record<string, unknown>[],
): VendorSchemaDetection {
  return {
    timestampFields: keysPresentInRawRecords(rawRecords, TIMESTAMP_KEYS),
    marketTickerFields: keysPresentInRawRecords(rawRecords, MARKET_KEYS),
    seriesFields: keysPresentInRawRecords(rawRecords, SERIES_KEYS),
    eventFields: keysPresentInRawRecords(rawRecords, EVENT_KEYS),
    strikeFields: keysPresentInRawRecords(rawRecords, STRIKE_KEYS),
    yesBidFields: keysPresentInRawRecords(rawRecords, YES_BID_KEYS),
    yesAskFields: keysPresentInRawRecords(rawRecords, YES_ASK_KEYS),
    noBidFields: keysPresentInRawRecords(rawRecords, NO_BID_KEYS),
    noAskFields: keysPresentInRawRecords(rawRecords, NO_ASK_KEYS),
    sizeFields: keysPresentInRawRecords(rawRecords, SIZE_KEYS),
    tradeFields: keysPresentInRawRecords(rawRecords, TRADE_KEYS),
    sequenceFields: keysPresentInRawRecords(rawRecords, SEQUENCE_KEYS),
    exchangeTimestampFields: keysPresentInRawRecords(rawRecords, [
      "exchangeTimestampMs",
      "exchange_timestamp",
      "exchange_ts",
    ]),
    vendorReceiveTimestampFields: keysPresentInRawRecords(rawRecords, [
      "vendorReceiveTimestampMs",
      "vendor_receive_timestamp",
      "received_at",
    ]),
    snapshotVsDeltaHint: inferSnapshotHint(rawRecords),
  };
}

export function fieldAvailabilityFromNormalizedRows(
  rows: readonly NormalizedVendorSampleRow[],
): import("./vendorSampleIntakeTypes").VendorFieldAvailability {
  return {
    hasTimestamp: rows.some((row) => row.timestampMs !== null),
    hasMarketTicker: rows.some((row) => row.marketTicker !== null),
    hasSeriesTicker: rows.some((row) => row.seriesTicker !== null),
    hasEventTicker: rows.some((row) => row.eventTicker !== null),
    hasFloorStrike: rows.some((row) => row.floorStrike !== null),
    hasYesBidAsk: rows.some((row) => row.yesBidCents !== null && row.yesAskCents !== null),
    hasNoBidAsk: rows.some((row) => row.noBidCents !== null && row.noAskCents !== null),
    hasSizes: rows.some(
      (row) =>
        row.yesBidSize !== null
        || row.yesAskSize !== null
        || row.noBidSize !== null
        || row.noAskSize !== null,
    ),
    hasTrades: rows.some((row) => row.tradePriceCents !== null || row.tradeSize !== null),
    hasSequenceOrUpdate: rows.some((row) => row.sequenceOrUpdateId !== null),
    hasExchangeTimestamp: rows.some((row) => row.exchangeTimestampMs !== null),
    hasVendorReceiveTimestamp: rows.some((row) => row.vendorReceiveTimestampMs !== null),
  };
}

export function flattenRawRecordsFromParsed(parsed: unknown): Record<string, unknown>[] {
  if (Array.isArray(parsed)) {
    return parsed.filter(isRecord);
  }

  if (!isRecord(parsed)) {
    return [];
  }

  const arrayKeys = ["rows", "data", "records", "snapshots", "orderbooks", "samples"];
  for (const key of arrayKeys) {
    const value = parsed[key];
    if (Array.isArray(value)) {
      return value.filter(isRecord);
    }
  }

  return [parsed];
}
