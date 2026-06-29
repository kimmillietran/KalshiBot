import { z } from "zod";

import { DataQualityFlag } from "@/lib/data/schemas";
import type { RawHistoricalRecord, SettlementRecord } from "@/lib/data/types";
import { eventTimeSchema, isUtcIsoTimestamp } from "@/lib/data/timestamps";
import type { EventTime } from "@/lib/data/timestamps";

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
    floor_strike: z.number().finite().positive().nullable().optional(),
    expiration_value: z.union([z.string(), z.number()]).optional(),
    settlement_value_dollars: z.union([z.string(), z.number()]).optional(),
    result: z.enum(["yes", "no"]),
    settlement_ts: eventTimeSchema,
    quality_flags: z.array(z.string()).optional(),
  })
  .passthrough()
  .superRefine((body, ctx) => {
    const hasExpiration =
      body.expiration_value !== undefined && body.expiration_value !== "";
    const hasSettlementValue =
      body.settlement_value_dollars !== undefined
      && body.settlement_value_dollars !== "";

    if (!hasExpiration && !hasSettlementValue) {
      ctx.addIssue({
        code: "custom",
        message:
          "settlement payload requires expiration_value or settlement_value_dollars",
        path: ["expiration_value"],
      });
    }
  });

function unwrapSettlementPayload(
  record: RawHistoricalRecord,
): Record<string, unknown> {
  const payload = parsePayloadObject(record);
  if (isRecord(payload.market)) {
    return payload.market;
  }
  return payload;
}

function normalizeSettlementTimestamp(
  raw: string | undefined,
  recordId: string,
  label: string,
): EventTime {
  if (!raw?.trim()) {
    throw new SilverMalformedPayloadError(recordId, [
      `${label} is missing`,
    ]);
  }

  const parsedMs = Date.parse(raw.trim());
  if (!Number.isFinite(parsedMs)) {
    throw new SilverMalformedPayloadError(recordId, [
      `${label} is invalid`,
    ]);
  }

  const normalized = new Date(parsedMs).toISOString();
  if (!isUtcIsoTimestamp(normalized)) {
    throw new SilverMalformedPayloadError(recordId, [
      `${label} could not be normalized to UTC ISO`,
    ]);
  }

  return normalized as EventTime;
}

function parseSettlementPriceUsd(
  recordId: string,
  value: string | number,
): number {
  const parsed = typeof value === "number" ? value : Number.parseFloat(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new SilverMalformedPayloadError(recordId, [
      "settlement value must be a positive finite number",
    ]);
  }
  return parsed;
}

function resolveSettlementPriceUsd(
  recordId: string,
  body: Record<string, unknown>,
): number {
  const expirationValue = body.expiration_value ?? body.expirationValue;
  if (expirationValue !== undefined && expirationValue !== "") {
    return parseSettlementPriceUsd(recordId, expirationValue as string | number);
  }

  const settlementValueDollars = readString(
    body,
    "settlement_value_dollars",
    "settlementValueDollars",
  );
  if (settlementValueDollars !== undefined) {
    return parseSettlementPriceUsd(recordId, settlementValueDollars);
  }

  throw new SilverMalformedPayloadError(recordId, [
    "settlement payload requires expiration_value or settlement_value_dollars",
  ]);
}

function resolveStrikePriceUsd(
  recordId: string,
  body: Record<string, unknown>,
  settlementPriceUsd: number,
  qualityFlags: readonly string[],
): { strikePriceUsd: number; qualityFlags: readonly string[] } {
  const floorStrike = readNumber(body, "floor_strike", "floorStrike");
  if (floorStrike !== undefined && floorStrike > 0) {
    return { strikePriceUsd: floorStrike, qualityFlags };
  }

  if (body.floor_strike === null || floorStrike === undefined) {
    const result = readString(body, "result");
    const settlementTs = readString(body, "settlement_ts", "settlementTs");
    if (result && settlementTs) {
      return {
        strikePriceUsd: settlementPriceUsd,
        qualityFlags: [...qualityFlags, DataQualityFlag.PARTIAL_WINDOW],
      };
    }
  }

  throw new SilverMalformedPayloadError(recordId, [
    "settlement payload requires floor_strike or complete settlement fields",
  ]);
}

/** Normalizes a bronze settlement record into a validated SettlementRecord. */
export function normalizeSettlement(
  record: RawHistoricalRecord,
): SilverNormalizationResult<SettlementRecord> {
  const body = unwrapSettlementPayload(record);

  const result = readString(body, "result");
  const settlementTsRaw = readString(body, "settlement_ts", "settlementTs");
  const settlementTs = normalizeSettlementTimestamp(
    settlementTsRaw,
    record.recordId,
    "settlement_ts",
  );

  const settlementPriceUsd = resolveSettlementPriceUsd(record.recordId, body);
  const initialQualityFlags = normalizeQualityFlags(
    record.recordId,
    body.quality_flags ?? body.qualityFlags,
  );
  const { strikePriceUsd, qualityFlags } = resolveStrikePriceUsd(
    record.recordId,
    body,
    settlementPriceUsd,
    initialQualityFlags,
  );

  const parsedBody = settlementBodySchema.safeParse({
    floor_strike: readNumber(body, "floor_strike", "floorStrike") ?? null,
    expiration_value: body.expiration_value ?? body.expirationValue,
    settlement_value_dollars:
      body.settlement_value_dollars ?? body.settlementValueDollars,
    result,
    settlement_ts: settlementTs,
    quality_flags: [...qualityFlags],
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
    strikePriceUsd,
    settlementPriceUsd,
    result: parsedBody.data.result,
    settledAt: parsedBody.data.settlement_ts,
    qualityFlags: normalizeQualityFlags(record.recordId, qualityFlags),
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
