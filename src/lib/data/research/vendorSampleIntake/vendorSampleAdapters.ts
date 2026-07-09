import type { NormalizedVendorSampleRow } from "@/lib/data/research/vendorOrderbookSufficiencyAudit/parseVendorSample";

/** Lightweight vendor-specific row normalization hooks. */
export type VendorSampleAdapter = {
  vendorId: string;
  canAdapt: (rawRecords: readonly Record<string, unknown>[]) => boolean;
  adaptRows: (rawRecords: readonly Record<string, unknown>[]) => NormalizedVendorSampleRow[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(record: Record<string, unknown>, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return null;
}

function readNumber(record: Record<string, unknown>, ...keys: string[]): number | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) {
      return Number(value);
    }
  }

  return null;
}

function parseTimestampToMs(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value < 1_000_000_000_000 ? value * 1000 : value;
  }

  if (typeof value === "string" && value.trim()) {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) {
      return numeric < 1_000_000_000_000 ? numeric * 1000 : numeric;
    }

    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function genericNormalize(record: Record<string, unknown>): NormalizedVendorSampleRow {
  return {
    marketTicker: readString(record, "marketTicker", "market_ticker", "ticker", "market"),
    seriesTicker: readString(record, "seriesTicker", "series_ticker", "series"),
    eventTicker: readString(record, "eventTicker", "event_ticker", "event"),
    floorStrike: readNumber(record, "floorStrike", "floor_strike", "strike", "strikePriceUsd"),
    timestampMs: parseTimestampToMs(
      record.timestampMs ?? record.timestamp ?? record.ts ?? record.observedAt ?? record.eventTime,
    ),
    exchangeTimestampMs: parseTimestampToMs(
      record.exchangeTimestampMs ?? record.exchange_timestamp ?? record.exchange_ts,
    ),
    vendorReceiveTimestampMs: parseTimestampToMs(
      record.vendorReceiveTimestampMs ?? record.vendor_receive_timestamp ?? record.received_at,
    ),
    sequenceOrUpdateId: readString(record, "sequenceOrUpdateId", "sequence", "seq", "update_id", "updateId"),
    yesBidCents: readNumber(record, "yesBidCents", "yes_bid", "yes_bid_cents", "yesBid", "bid"),
    yesAskCents: readNumber(record, "yesAskCents", "yes_ask", "yes_ask_cents", "yesAsk", "ask"),
    noBidCents: readNumber(record, "noBidCents", "no_bid", "no_bid_cents", "noBid"),
    noAskCents: readNumber(record, "noAskCents", "no_ask", "no_ask_cents", "noAsk"),
    yesBidSize: readNumber(record, "yesBidSize", "yes_bid_size", "bid_size", "yesBidQty"),
    yesAskSize: readNumber(record, "yesAskSize", "yes_ask_size", "ask_size", "yesAskQty"),
    noBidSize: readNumber(record, "noBidSize", "no_bid_size", "noBidQty"),
    noAskSize: readNumber(record, "noAskSize", "no_ask_size", "noAskQty"),
    tradePriceCents: readNumber(record, "tradePriceCents", "trade_price", "price"),
    tradeSize: readNumber(record, "tradeSize", "trade_size", "size", "quantity"),
  };
}

function predexonAdapter(): VendorSampleAdapter {
  return {
    vendorId: "predexon",
    canAdapt: (records) => records.some((record) => "predexon_market_id" in record || "yes_bid" in record),
    adaptRows: (records) =>
      records.map((record) =>
        genericNormalize({
          ...record,
          market_ticker: record.market_ticker ?? record.predexon_market_id,
        }),
      ),
  };
}

function domeAdapter(): VendorSampleAdapter {
  return {
    vendorId: "dome",
    canAdapt: (records) => records.some((record) => "dome_market" in record || "contract_ticker" in record),
    adaptRows: (records) =>
      records.map((record) =>
        genericNormalize({
          ...record,
          market_ticker: record.contract_ticker ?? record.dome_market,
        }),
      ),
  };
}

function alliumAdapter(): VendorSampleAdapter {
  return {
    vendorId: "allium",
    canAdapt: (records) => records.some((record) => "allium_symbol" in record || "symbol" in record),
    adaptRows: (records) =>
      records.map((record) =>
        genericNormalize({
          ...record,
          market_ticker: record.allium_symbol ?? record.symbol,
        }),
      ),
  };
}

function lycheeAdapter(): VendorSampleAdapter {
  return {
    vendorId: "lychee",
    canAdapt: (records) => records.some((record) => "lychee_ticker" in record),
    adaptRows: (records) =>
      records.map((record) =>
        genericNormalize({
          ...record,
          market_ticker: record.lychee_ticker,
        }),
      ),
  };
}

function synthesisAdapter(): VendorSampleAdapter {
  return {
    vendorId: "synthesis",
    canAdapt: (records) => records.some((record) => "synthesis_id" in record),
    adaptRows: (records) =>
      records.map((record) =>
        genericNormalize({
          ...record,
          market_ticker: record.synthesis_id,
        }),
      ),
  };
}

export const VENDOR_SAMPLE_ADAPTERS: readonly VendorSampleAdapter[] = [
  predexonAdapter(),
  domeAdapter(),
  alliumAdapter(),
  lycheeAdapter(),
  synthesisAdapter(),
];

export function adaptVendorSampleRows(input: {
  vendorId: string;
  rawRecords: readonly Record<string, unknown>[];
}): NormalizedVendorSampleRow[] {
  const adapter = VENDOR_SAMPLE_ADAPTERS.find((entry) => entry.vendorId === input.vendorId);
  if (adapter?.canAdapt(input.rawRecords)) {
    return adapter.adaptRows(input.rawRecords.filter(isRecord));
  }

  return input.rawRecords.filter(isRecord).map(genericNormalize);
}
