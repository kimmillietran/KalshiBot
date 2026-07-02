import { z } from "zod";

import { DataQualityFlag } from "@/lib/data/schemas";
import type { EventTime, KalshiCandle1m, RawHistoricalRecord } from "@/lib/data/types";
import { eventTimeSchema } from "@/lib/data/timestamps";

import { SilverMalformedPayloadError } from "./errors";
import {
  datasetVersion,
  finalizeSilverRecord,
  formatZodIssues,
  isRecord,
  kalshiCandle1mSchema,
  normalizeQualityFlags,
  parsePayloadObject,
  readNumber,
  readString,
  type SilverNormalizationResult,
} from "./shared";

const LIVE_KALSHI_HISTORICAL_CANDLE_INTERVAL_SECONDS = 60;

const contractPriceCentsSchema = z
  .number()
  .int()
  .min(0)
  .max(100)
  .finite();

const kalshiCandleBronzePayloadSchema = z
  .object({
    open_time: eventTimeSchema,
    close_time: eventTimeSchema,
    yes_bid_cents: contractPriceCentsSchema,
    yes_ask_cents: contractPriceCentsSchema,
    no_bid_cents: contractPriceCentsSchema,
    no_ask_cents: contractPriceCentsSchema,
    volume_contracts: z.number().finite().nonnegative().nullable().optional(),
    quality_flags: z.array(z.string()).optional(),
  })
  .passthrough();

type ParsedKalshiCandleBronzePayload = z.infer<typeof kalshiCandleBronzePayloadSchema>;

function readContractCents(
  payload: Record<string, unknown>,
  snakeKey: string,
  camelKey: string,
): number | undefined {
  return readNumber(payload, snakeKey, camelKey);
}

/** Matches {@link parseKalshiDollarToCents} in market-data pricing. */
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

function hasLegacyKalshiCandleQuotes(payload: Record<string, unknown>): boolean {
  return (
    readContractCents(payload, "yes_bid_cents", "yesBidCents") !== undefined
    || readContractCents(payload, "yes_ask_cents", "yesAskCents") !== undefined
  );
}

function unixSecondsToEventTime(unixSeconds: number): EventTime {
  return new Date(unixSeconds * 1000).toISOString() as EventTime;
}

function finalizeKalshiCandleNormalization(
  record: RawHistoricalRecord,
  parsedPayload: ParsedKalshiCandleBronzePayload,
): SilverNormalizationResult<KalshiCandle1m> {
  const candidate: KalshiCandle1m = {
    eventTime: record.eventTime,
    collectionTime: record.collectionTime,
    observedAt: record.observedAt,
    ticker: record.ticker,
    openTime: parsedPayload.open_time,
    closeTime: parsedPayload.close_time,
    yesBidCents: parsedPayload.yes_bid_cents,
    yesAskCents: parsedPayload.yes_ask_cents,
    noBidCents: parsedPayload.no_bid_cents,
    noAskCents: parsedPayload.no_ask_cents,
    volumeContracts: parsedPayload.volume_contracts ?? null,
    qualityFlags: normalizeQualityFlags(record.recordId, parsedPayload.quality_flags),
    datasetVersion: datasetVersion(),
  };

  const validated = kalshiCandle1mSchema.safeParse(candidate);
  if (!validated.success) {
    throw new SilverMalformedPayloadError(
      record.recordId,
      formatZodIssues(validated.error),
    );
  }

  return finalizeSilverRecord(kalshiCandle1mSchema, record, validated.data);
}

function parseKalshiCandleBronzePayload(
  record: RawHistoricalRecord,
  fields: Record<string, unknown>,
): ParsedKalshiCandleBronzePayload {
  const parsedPayload = kalshiCandleBronzePayloadSchema.safeParse(fields);

  if (!parsedPayload.success) {
    throw new SilverMalformedPayloadError(
      record.recordId,
      formatZodIssues(parsedPayload.error),
    );
  }

  return parsedPayload.data;
}

function normalizeLegacyKalshiCandle(
  record: RawHistoricalRecord,
  payload: Record<string, unknown>,
): SilverNormalizationResult<KalshiCandle1m> {
  const parsedPayload = parseKalshiCandleBronzePayload(record, {
    open_time: readString(payload, "open_time", "openTime"),
    close_time: readString(payload, "close_time", "closeTime"),
    yes_bid_cents: readContractCents(payload, "yes_bid_cents", "yesBidCents"),
    yes_ask_cents: readContractCents(payload, "yes_ask_cents", "yesAskCents"),
    no_bid_cents: readContractCents(payload, "no_bid_cents", "noBidCents"),
    no_ask_cents: readContractCents(payload, "no_ask_cents", "noAskCents"),
    volume_contracts:
      readNumber(payload, "volume_contracts", "volumeContracts") ?? null,
    quality_flags: payload.quality_flags ?? payload.qualityFlags,
  });

  return finalizeKalshiCandleNormalization(record, parsedPayload);
}

function mergeLiveHistoricalCandleQualityFlags(
  payload: Record<string, unknown>,
): string[] {
  const existing = payload.quality_flags ?? payload.qualityFlags;
  const flags = Array.isArray(existing) ? [...existing] : [];

  if (!flags.includes(DataQualityFlag.MISSING_BID_ASK)) {
    flags.push(DataQualityFlag.MISSING_BID_ASK);
  }

  return flags;
}

function normalizeLiveKalshiHistoricalCandle(
  record: RawHistoricalRecord,
  payload: Record<string, unknown>,
): SilverNormalizationResult<KalshiCandle1m> {
  const endPeriodTs = readNumber(payload, "end_period_ts", "endPeriodTs");
  if (endPeriodTs === undefined) {
    throw new SilverMalformedPayloadError(record.recordId, [
      "end_period_ts is missing",
    ]);
  }

  const price = payload.price;
  if (!isRecord(price)) {
    throw new SilverMalformedPayloadError(record.recordId, [
      "price object is missing",
    ]);
  }

  const closeDollars = readString(price, "close");
  if (!closeDollars) {
    throw new SilverMalformedPayloadError(record.recordId, [
      "price.close is missing",
    ]);
  }

  const yesCloseCents = parseKalshiDollarStringToCents(closeDollars);
  if (yesCloseCents === null || yesCloseCents < 0 || yesCloseCents > 100) {
    throw new SilverMalformedPayloadError(record.recordId, [
      "price.close is invalid",
    ]);
  }

  const noCloseCents = 100 - yesCloseCents;
  const closeTime = unixSecondsToEventTime(endPeriodTs);
  const openTime = unixSecondsToEventTime(
    endPeriodTs - LIVE_KALSHI_HISTORICAL_CANDLE_INTERVAL_SECONDS,
  );

  const parsedPayload = parseKalshiCandleBronzePayload(record, {
    open_time: openTime,
    close_time: closeTime,
    yes_bid_cents: yesCloseCents,
    yes_ask_cents: yesCloseCents,
    no_bid_cents: noCloseCents,
    no_ask_cents: noCloseCents,
    volume_contracts:
      readNumber(payload, "volume_contracts", "volumeContracts")
      ?? readNumber(payload, "volume")
      ?? null,
    quality_flags: mergeLiveHistoricalCandleQualityFlags(payload),
  });

  return finalizeKalshiCandleNormalization(record, parsedPayload);
}

/** Normalizes a bronze candlestick record into a validated KalshiCandle1m. */
export function normalizeKalshiCandle(
  record: RawHistoricalRecord,
): SilverNormalizationResult<KalshiCandle1m> {
  const payload = parsePayloadObject(record);

  if (
    !hasLegacyKalshiCandleQuotes(payload)
    && readNumber(payload, "end_period_ts", "endPeriodTs") !== undefined
  ) {
    return normalizeLiveKalshiHistoricalCandle(record, payload);
  }

  return normalizeLegacyKalshiCandle(record, payload);
}
