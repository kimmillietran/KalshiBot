import { BtcProviderMalformedResponseError } from "./errors";
import type { BtcProviderCandle } from "./interface";

/** Coinbase candle tuple: [time, low, high, open, close, volume]. */
export const COINBASE_CANDLE_FIELD_COUNT = 6;

export type CoinbaseCandleRow = [
  timestampSec: number,
  low: number,
  high: number,
  open: number,
  close: number,
  volume: number,
];

function formatCandleTime(timestampMs: number): string {
  return new Date(timestampMs).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function parseFiniteNumber(
  value: unknown,
  field: string,
  rowIndex: number,
): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new BtcProviderMalformedResponseError(
      `Coinbase candle row ${rowIndex}: ${field} is not a valid number`,
    );
  }
  return value;
}

function parseCoinbaseCandleRow(row: unknown, rowIndex: number): CoinbaseCandleRow {
  if (!Array.isArray(row)) {
    throw new BtcProviderMalformedResponseError(
      `Coinbase candle row ${rowIndex} is not an array`,
    );
  }

  if (row.length !== COINBASE_CANDLE_FIELD_COUNT) {
    throw new BtcProviderMalformedResponseError(
      `Coinbase candle row ${rowIndex} has invalid length (expected ${COINBASE_CANDLE_FIELD_COUNT}, got ${row.length})`,
    );
  }

  return [
    parseFiniteNumber(row[0], "timestamp", rowIndex),
    parseFiniteNumber(row[1], "low", rowIndex),
    parseFiniteNumber(row[2], "high", rowIndex),
    parseFiniteNumber(row[3], "open", rowIndex),
    parseFiniteNumber(row[4], "close", rowIndex),
    parseFiniteNumber(row[5], "volume", rowIndex),
  ];
}

/** Parse and validate Coinbase candles JSON before domain mapping. */
export function parseCoinbaseCandlesJson(json: unknown): CoinbaseCandleRow[] {
  if (!Array.isArray(json)) {
    throw new BtcProviderMalformedResponseError(
      "Coinbase candles payload is not an array",
    );
  }

  return json.map((row, index) => parseCoinbaseCandleRow(row, index));
}

/** Map validated Coinbase rows to normalized domain candles. */
export function mapCoinbaseCandleRows(rows: CoinbaseCandleRow[]): BtcProviderCandle[] {
  return rows
    .map((row) => {
      const timestampSec = row[0];
      const timestamp = timestampSec * 1000;
      return {
        timestamp,
        time: formatCandleTime(timestamp),
        open: row[3],
        high: row[2],
        low: row[1],
        close: row[4],
      };
    })
    .sort((a, b) => a.timestamp - b.timestamp);
}
