import { z } from "zod";

import type { MarketWindow, RawHistoricalRecord } from "@/lib/data/types";
import { eventTimeSchema } from "@/lib/data/timestamps";

import { SilverMalformedPayloadError } from "./errors";
import {
  datasetVersion,
  finalizeSilverRecord,
  formatZodIssues,
  marketWindowSchema,
  normalizeQualityFlags,
  parsePayloadObject,
  readString,
  type SilverNormalizationResult,
} from "./shared";

const kalshiMarketBronzePayloadSchema = z
  .object({
    open_time: eventTimeSchema,
    close_time: eventTimeSchema,
    floor_strike: z.number().finite().positive(),
    event_ticker: z.string().trim().min(1),
    status: z.string().trim().min(1),
    series_ticker: z.string().trim().min(1).optional(),
    quality_flags: z.array(z.string()).optional(),
  })
  .passthrough();

function mapMarketStatus(
  status: string,
): MarketWindow["status"] | null {
  const normalized = status.trim().toLowerCase();
  if (normalized === "active" || normalized === "open") {
    return "open";
  }
  if (normalized === "closed") {
    return "closed";
  }
  if (normalized === "settled" || normalized === "finalized") {
    return "settled";
  }
  return null;
}

function resolveSeriesTicker(
  bronzeTicker: string,
  payload: Record<string, unknown>,
): string {
  const explicit = readString(payload, "series_ticker", "seriesTicker");
  if (explicit !== undefined) {
    return explicit;
  }

  const eventTicker = readString(payload, "event_ticker", "eventTicker");
  if (eventTicker !== undefined) {
    const [series] = eventTicker.split("-");
    if (series) {
      return series;
    }
  }

  const [fromTicker] = bronzeTicker.split("-");
  if (fromTicker) {
    return fromTicker;
  }

  throw new SilverMalformedPayloadError(bronzeTicker, [
    "unable to resolve series ticker from payload",
  ]);
}

/** Normalizes a bronze market record into a validated MarketWindow. */
export function normalizeMarketWindow(
  record: RawHistoricalRecord,
): SilverNormalizationResult<MarketWindow> {
  const payload = parsePayloadObject(record);
  const parsedPayload = kalshiMarketBronzePayloadSchema.safeParse(payload);
  if (!parsedPayload.success) {
    throw new SilverMalformedPayloadError(
      record.recordId,
      formatZodIssues(parsedPayload.error),
    );
  }

  const status = mapMarketStatus(parsedPayload.data.status);
  if (status === null) {
    throw new SilverMalformedPayloadError(record.recordId, [
      `unsupported market status "${parsedPayload.data.status}"`,
    ]);
  }

  const candidate: MarketWindow = {
    eventTime: record.eventTime,
    collectionTime: record.collectionTime,
    observedAt: record.observedAt,
    ticker: record.ticker,
    seriesTicker: resolveSeriesTicker(record.ticker, payload),
    openTime: parsedPayload.data.open_time,
    closeTime: parsedPayload.data.close_time,
    strikePriceUsd: parsedPayload.data.floor_strike,
    status,
    qualityFlags: normalizeQualityFlags(
      payload.quality_flags ?? payload.qualityFlags,
    ),
    datasetVersion: datasetVersion(),
  };

  const validated = marketWindowSchema.safeParse(candidate);
  if (!validated.success) {
    throw new SilverMalformedPayloadError(
      record.recordId,
      formatZodIssues(validated.error),
    );
  }

  return finalizeSilverRecord(marketWindowSchema, record, validated.data);
}
