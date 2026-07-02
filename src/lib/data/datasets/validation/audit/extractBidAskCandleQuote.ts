import type { RawHistoricalRecord } from "@/lib/data/types";

import type { BidAskCandleQuote } from "./bidAskFidelityTypes";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readNumber(
  record: Record<string, unknown>,
  ...keys: string[]
): number | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
  }
  return undefined;
}

function readString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function readContractCents(
  payload: Record<string, unknown>,
  snakeKey: string,
  camelKey: string,
): number | undefined {
  return readNumber(payload, snakeKey, camelKey);
}

function hasLegacyKalshiCandleQuotes(payload: Record<string, unknown>): boolean {
  return (
    readContractCents(payload, "yes_bid_cents", "yesBidCents") !== undefined
    || readContractCents(payload, "yes_ask_cents", "yesAskCents") !== undefined
  );
}

/** Matches {@link parseKalshiDollarStringToCents} in normalizeCandles. */
function parseKalshiDollarStringToCents(value: string): number | null {
  if (value.trim() === "") {
    return null;
  }

  const parsed = Number.parseFloat(value);
  if (Number.isNaN(parsed)) {
    return null;
  }

  return Math.round(parsed * 100);
}

/** Extracts YES-side bid/ask fidelity information from a bronze candle payload. */
export function extractBidAskCandleQuote(
  record: RawHistoricalRecord,
): BidAskCandleQuote {
  const payload = record.payload;
  if (!isRecord(payload)) {
    return {
      source: "missing",
      yesBidCents: null,
      yesAskCents: null,
    };
  }

  if (hasLegacyKalshiCandleQuotes(payload)) {
    const yesBidCents =
      readContractCents(payload, "yes_bid_cents", "yesBidCents") ?? null;
    const yesAskCents =
      readContractCents(payload, "yes_ask_cents", "yesAskCents") ?? null;

    if (yesBidCents === null || yesAskCents === null) {
      return {
        source: "missing",
        yesBidCents,
        yesAskCents,
      };
    }

    return {
      source: "legacy-bid-ask",
      yesBidCents,
      yesAskCents,
    };
  }

  const endPeriodTs = readNumber(payload, "end_period_ts", "endPeriodTs");
  const price = payload.price;
  if (endPeriodTs !== undefined && isRecord(price)) {
    const closeDollars = readString(price, "close");
    if (closeDollars) {
      const yesCloseCents = parseKalshiDollarStringToCents(closeDollars);
      if (yesCloseCents !== null && yesCloseCents >= 0 && yesCloseCents <= 100) {
        return {
          source: "live-close-only",
          yesBidCents: yesCloseCents,
          yesAskCents: yesCloseCents,
        };
      }
    }
  }

  return {
    source: "missing",
    yesBidCents: null,
    yesAskCents: null,
  };
}
