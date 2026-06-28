import { z } from "zod";

import type { KalshiCandle1m, RawHistoricalRecord } from "@/lib/data/types";
import { eventTimeSchema } from "@/lib/data/timestamps";

import { SilverMalformedPayloadError } from "./errors";
import {
  datasetVersion,
  finalizeSilverRecord,
  formatZodIssues,
  kalshiCandle1mSchema,
  normalizeQualityFlags,
  parsePayloadObject,
  readNumber,
  readString,
  type SilverNormalizationResult,
} from "./shared";

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

function readContractCents(
  payload: Record<string, unknown>,
  snakeKey: string,
  camelKey: string,
): number | undefined {
  return readNumber(payload, snakeKey, camelKey);
}

/** Normalizes a bronze candlestick record into a validated KalshiCandle1m. */
export function normalizeKalshiCandle(
  record: RawHistoricalRecord,
): SilverNormalizationResult<KalshiCandle1m> {
  const payload = parsePayloadObject(record);

  const yesBidCents = readContractCents(payload, "yes_bid_cents", "yesBidCents");
  const yesAskCents = readContractCents(payload, "yes_ask_cents", "yesAskCents");
  const noBidCents = readContractCents(payload, "no_bid_cents", "noBidCents");
  const noAskCents = readContractCents(payload, "no_ask_cents", "noAskCents");

  const parsedPayload = kalshiCandleBronzePayloadSchema.safeParse({
    open_time: readString(payload, "open_time", "openTime"),
    close_time: readString(payload, "close_time", "closeTime"),
    yes_bid_cents: yesBidCents,
    yes_ask_cents: yesAskCents,
    no_bid_cents: noBidCents,
    no_ask_cents: noAskCents,
    volume_contracts:
      readNumber(payload, "volume_contracts", "volumeContracts") ?? null,
    quality_flags: payload.quality_flags ?? payload.qualityFlags,
  });

  if (!parsedPayload.success) {
    throw new SilverMalformedPayloadError(
      record.recordId,
      formatZodIssues(parsedPayload.error),
    );
  }

  const candidate: KalshiCandle1m = {
    eventTime: record.eventTime,
    collectionTime: record.collectionTime,
    observedAt: record.observedAt,
    ticker: record.ticker,
    openTime: parsedPayload.data.open_time,
    closeTime: parsedPayload.data.close_time,
    yesBidCents: parsedPayload.data.yes_bid_cents,
    yesAskCents: parsedPayload.data.yes_ask_cents,
    noBidCents: parsedPayload.data.no_bid_cents,
    noAskCents: parsedPayload.data.no_ask_cents,
    volumeContracts: parsedPayload.data.volume_contracts ?? null,
    qualityFlags: normalizeQualityFlags(record.recordId, parsedPayload.data.quality_flags),
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
