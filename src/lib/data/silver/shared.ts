import { z } from "zod";

import type { FetchProvenance } from "@/lib/data/provenance";
import {
  dataQualityFlagSchema,
  kalshiCandle1mSchema,
  marketWindowSchema,
  rawHistoricalRecordSchema,
  settlementRecordSchema,
} from "@/lib/data/schemas";
import type {
  KalshiCandle1m,
  MarketWindow,
  RawHistoricalRecord,
  SettlementRecord,
} from "@/lib/data/types";
import { DATA_CONTRACT_VERSION } from "@/lib/data/versioning";

import { SilverInvalidBronzeRecordError, SilverMalformedPayloadError } from "./errors";

export const SILVER_BRONZE_CONTENT_TYPE = {
  MARKET: "kalshi.historical.market",
  CANDLESTICK: "kalshi.historical.candlestick",
  SETTLEMENT: "kalshi.historical.settlement",
} as const;

export type SilverBronzeContentType =
  (typeof SILVER_BRONZE_CONTENT_TYPE)[keyof typeof SILVER_BRONZE_CONTENT_TYPE];

export type SilverNormalizationResult<T> = {
  bronzeRecordId: string;
  provenance: FetchProvenance;
  record: T;
};

export type SilverNormalizationOutput =
  | SilverNormalizationResult<MarketWindow>
  | SilverNormalizationResult<KalshiCandle1m>
  | SilverNormalizationResult<SettlementRecord>;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function readString(
  record: Record<string, unknown>,
  ...keys: string[]
): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value;
    }
  }
  return undefined;
}

export function readNumber(
  record: Record<string, unknown>,
  ...keys: string[]
): number | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === "string" && value.trim().length > 0) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }
  return undefined;
}

export function normalizeQualityFlags(
  recordId: string,
  value: unknown,
): z.infer<typeof dataQualityFlagSchema>[] {
  if (value === undefined || value === null) {
    return [];
  }

  const parsed = z.array(dataQualityFlagSchema).safeParse(value);
  if (!parsed.success) {
    throw new SilverMalformedPayloadError(recordId, formatZodIssues(parsed.error));
  }

  return [...parsed.data].sort();
}

export function parseBronzeRecord(record: RawHistoricalRecord): RawHistoricalRecord {
  const result = rawHistoricalRecordSchema.safeParse(record);
  if (!result.success) {
    throw new SilverInvalidBronzeRecordError(
      record.recordId ?? "unknown",
      result.error.issues.map((issue) => issue.message),
    );
  }
  return result.data;
}

export function parsePayloadObject(
  record: RawHistoricalRecord,
): Record<string, unknown> {
  if (!isRecord(record.payload)) {
    throw new SilverMalformedPayloadError(record.recordId, [
      "payload must be a JSON object",
    ]);
  }
  return record.payload;
}

export function formatZodIssues(error: z.ZodError): string[] {
  return error.issues.map((issue) => issue.message);
}

export function finalizeSilverRecord<T>(
  schema: z.ZodType<T>,
  record: RawHistoricalRecord,
  candidate: T,
): SilverNormalizationResult<T> {
  const parsed = schema.parse(candidate);
  return {
    bronzeRecordId: record.recordId,
    provenance: { ...record.provenance },
    record: parsed,
  };
}

export function datasetVersion(): typeof DATA_CONTRACT_VERSION {
  return DATA_CONTRACT_VERSION;
}

export {
  kalshiCandle1mSchema,
  marketWindowSchema,
  settlementRecordSchema,
};
