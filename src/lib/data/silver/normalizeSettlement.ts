import { z } from "zod";

import type { RawHistoricalRecord, SettlementRecord } from "@/lib/data/types";
import { eventTimeSchema } from "@/lib/data/timestamps";

import { SilverMalformedPayloadError } from "./errors";
import {
  datasetVersion,
  finalizeSilverRecord,
  formatZodIssues,
  isRecord,
  normalizeQualityFlags,
  parsePayloadObject,
  readNumber,
  readString,
  settlementRecordSchema,
  type SilverNormalizationResult,
} from "./shared";

const settlementBodySchema = z
  .object({
    floor_strike: z.number().finite().positive(),
    expiration_value: z.union([z.string(), z.number()]),
    result: z.enum(["yes", "no"]),
    settlement_ts: eventTimeSchema,
    quality_flags: z.array(z.string()).optional(),
  })
  .passthrough();

function unwrapSettlementPayload(
  record: RawHistoricalRecord,
): Record<string, unknown> {
  const payload = parsePayloadObject(record);
  if (isRecord(payload.market)) {
    return payload.market;
  }
  return payload;
}

function parseSettlementPriceUsd(
  recordId: string,
  value: string | number,
): number {
  const parsed = typeof value === "number" ? value : Number.parseFloat(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new SilverMalformedPayloadError(recordId, [
      "expiration_value must be a positive finite number",
    ]);
  }
  return parsed;
}

/** Normalizes a bronze settlement record into a validated SettlementRecord. */
export function normalizeSettlement(
  record: RawHistoricalRecord,
): SilverNormalizationResult<SettlementRecord> {
  const body = unwrapSettlementPayload(record);

  const floorStrike = readNumber(body, "floor_strike", "floorStrike");
  const expirationValue = body.expiration_value ?? body.expirationValue;
  const result = readString(body, "result");
  const settlementTs = readString(body, "settlement_ts", "settlementTs");

  const parsedBody = settlementBodySchema.safeParse({
    floor_strike: floorStrike,
    expiration_value: expirationValue,
    result,
    settlement_ts: settlementTs,
    quality_flags: body.quality_flags ?? body.qualityFlags,
  });

  if (!parsedBody.success) {
    throw new SilverMalformedPayloadError(
      record.recordId,
      formatZodIssues(parsedBody.error),
    );
  }

  const candidate: SettlementRecord = {
    eventTime: record.eventTime,
    collectionTime: record.collectionTime,
    observedAt: record.observedAt,
    ticker: record.ticker,
    strikePriceUsd: parsedBody.data.floor_strike,
    settlementPriceUsd: parseSettlementPriceUsd(
      record.recordId,
      parsedBody.data.expiration_value,
    ),
    result: parsedBody.data.result,
    settledAt: parsedBody.data.settlement_ts,
    qualityFlags: normalizeQualityFlags(record.recordId, parsedBody.data.quality_flags),
    datasetVersion: datasetVersion(),
  };

  const validated = settlementRecordSchema.safeParse(candidate);
  if (!validated.success) {
    throw new SilverMalformedPayloadError(
      record.recordId,
      formatZodIssues(validated.error),
    );
  }

  return finalizeSilverRecord(settlementRecordSchema, record, validated.data);
}
