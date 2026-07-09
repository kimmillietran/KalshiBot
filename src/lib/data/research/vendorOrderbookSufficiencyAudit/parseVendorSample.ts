import type { VendorOrderbookSufficiencyAuditIo } from "./vendorOrderbookSufficiencyAuditTypes";

const JSON_EXTENSIONS = [".json"];
const CSV_EXTENSIONS = [".csv"];

export function discoverVendorSampleFiles(input: {
  samplesRoot: string;
  vendorDirName: string;
  io: VendorOrderbookSufficiencyAuditIo;
}): readonly string[] {
  const vendorDir = `${input.samplesRoot.replace(/\\/g, "/").replace(/\/$/, "")}/${input.vendorDirName}`;

  if (!input.io.fileExists(vendorDir) || !input.io.isDirectory(vendorDir)) {
    return [];
  }

  const files: string[] = [];
  for (const entry of input.io.readdir(vendorDir)) {
    if (entry === "." || entry === "..") {
      continue;
    }

    const fullPath = `${vendorDir}/${entry}`;
    if (!input.io.fileExists(fullPath)) {
      continue;
    }

    if (input.io.isDirectory(fullPath)) {
      continue;
    }

    const lower = entry.toLowerCase();
    if (
      JSON_EXTENSIONS.some((ext) => lower.endsWith(ext))
      || CSV_EXTENSIONS.some((ext) => lower.endsWith(ext))
    ) {
      files.push(fullPath);
    }
  }

  return files.sort();
}

export type NormalizedVendorSampleRow = {
  marketTicker: string | null;
  seriesTicker: string | null;
  eventTicker: string | null;
  floorStrike: number | null;
  timestampMs: number | null;
  exchangeTimestampMs: number | null;
  vendorReceiveTimestampMs: number | null;
  sequenceOrUpdateId: string | null;
  yesBidCents: number | null;
  yesAskCents: number | null;
  noBidCents: number | null;
  noAskCents: number | null;
  yesBidSize: number | null;
  yesAskSize: number | null;
  noBidSize: number | null;
  noAskSize: number | null;
  tradePriceCents: number | null;
  tradeSize: number | null;
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

function normalizeRow(record: Record<string, unknown>): NormalizedVendorSampleRow {
  const yesBid = readNumber(record, "yesBidCents", "yes_bid", "yes_bid_cents", "yesBid", "bid");
  const yesAsk = readNumber(record, "yesAskCents", "yes_ask", "yes_ask_cents", "yesAsk", "ask");
  const noBid = readNumber(record, "noBidCents", "no_bid", "no_bid_cents", "noBid");
  const noAsk = readNumber(record, "noAskCents", "no_ask", "no_ask_cents", "noAsk");

  return {
    marketTicker: readString(record, "marketTicker", "market_ticker", "ticker", "market"),
    seriesTicker: readString(record, "seriesTicker", "series_ticker", "series"),
    eventTicker: readString(record, "eventTicker", "event_ticker", "event"),
    floorStrike: readNumber(record, "floorStrike", "floor_strike", "strike", "strikePriceUsd"),
    timestampMs: parseTimestampToMs(
      record.timestampMs
      ?? record.timestamp
      ?? record.ts
      ?? record.observedAt
      ?? record.eventTime,
    ),
    exchangeTimestampMs: parseTimestampToMs(
      record.exchangeTimestampMs ?? record.exchange_timestamp ?? record.exchange_ts,
    ),
    vendorReceiveTimestampMs: parseTimestampToMs(
      record.vendorReceiveTimestampMs
      ?? record.vendor_receive_timestamp
      ?? record.received_at,
    ),
    sequenceOrUpdateId: readString(
      record,
      "sequenceOrUpdateId",
      "sequence",
      "seq",
      "update_id",
      "updateId",
    ),
    yesBidCents: yesBid,
    yesAskCents: yesAsk,
    noBidCents: noBid,
    noAskCents: noAsk,
    yesBidSize: readNumber(record, "yesBidSize", "yes_bid_size", "bid_size", "yesBidQty"),
    yesAskSize: readNumber(record, "yesAskSize", "yes_ask_size", "ask_size", "yesAskQty"),
    noBidSize: readNumber(record, "noBidSize", "no_bid_size", "noBidQty"),
    noAskSize: readNumber(record, "noAskSize", "no_ask_size", "noAskQty"),
    tradePriceCents: readNumber(record, "tradePriceCents", "trade_price", "price"),
    tradeSize: readNumber(record, "tradeSize", "trade_size", "size", "quantity"),
  };
}

function flattenJsonRecords(parsed: unknown): Record<string, unknown>[] {
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

  if (isRecord(parsed.orderbook) || isRecord(parsed.book)) {
    return [parsed];
  }

  return [parsed];
}

function parseCsvRows(raw: string): Record<string, unknown>[] {
  const lines = raw.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length < 2) {
    return [];
  }

  const headers = lines[0]!.split(",").map((header) => header.trim());
  const rows: Record<string, unknown>[] = [];

  for (const line of lines.slice(1)) {
    const values = line.split(",").map((value) => value.trim());
    const record: Record<string, unknown> = {};
    for (let index = 0; index < headers.length; index += 1) {
      const header = headers[index];
      if (!header) {
        continue;
      }
      record[header] = values[index] ?? "";
    }
    rows.push(record);
  }

  return rows;
}

export type ParsedVendorSampleFile = {
  filePath: string;
  format: "json" | "csv" | "unsupported";
  rows: readonly NormalizedVendorSampleRow[];
  error: string | null;
};

export function parseVendorSampleFile(input: {
  filePath: string;
  raw: string;
}): ParsedVendorSampleFile {
  const lower = input.filePath.toLowerCase();

  if (lower.endsWith(".csv")) {
    const records = parseCsvRows(input.raw);
    return {
      filePath: input.filePath,
      format: "csv",
      rows: records.map(normalizeRow),
      error: records.length === 0 ? "CSV contained no data rows" : null,
    };
  }

  if (lower.endsWith(".json")) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(input.raw);
    } catch {
      return {
        filePath: input.filePath,
        format: "json",
        rows: [],
        error: "Invalid JSON",
      };
    }

    const records = flattenJsonRecords(parsed);
    return {
      filePath: input.filePath,
      format: "json",
      rows: records.map(normalizeRow),
      error: records.length === 0 ? "JSON contained no recognizable rows" : null,
    };
  }

  return {
    filePath: input.filePath,
    format: "unsupported",
    rows: [],
    error: "Unsupported file extension",
  };
}

export function parseVendorSampleFiles(input: {
  filePaths: readonly string[];
  io: VendorOrderbookSufficiencyAuditIo;
}): readonly ParsedVendorSampleFile[] {
  return input.filePaths.map((filePath) =>
    parseVendorSampleFile({
      filePath,
      raw: input.io.readFile(filePath),
    }),
  );
}
