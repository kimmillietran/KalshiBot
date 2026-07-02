import { posix } from "node:path";

import { SILVER_BRONZE_CONTENT_TYPE } from "@/lib/data/silver";

export function resolveSeriesTicker(marketTicker: string): string {
  const [seriesTicker] = marketTicker.split("-");
  return seriesTicker?.trim() || marketTicker;
}

export function buildMarketArtifactPath(
  root: string,
  seriesTicker: string,
  marketTicker: string,
  filename: string,
): string {
  return posix.join(root, seriesTicker, marketTicker, filename);
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function readString(
  record: Record<string, unknown>,
  ...keys: string[]
): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return undefined;
}

export type BronzeSettlementRecord = {
  index: number;
  result: "yes" | "no";
  fieldPath: string;
  ticker: string | null;
};

export function findBronzeSettlementRecords(
  bronzeRecords: unknown,
): BronzeSettlementRecord[] {
  if (!Array.isArray(bronzeRecords)) {
    return [];
  }

  const matches: BronzeSettlementRecord[] = [];

  for (let index = 0; index < bronzeRecords.length; index += 1) {
    const record = bronzeRecords[index];
    if (!isRecord(record)) {
      continue;
    }

    if (record.contentType !== SILVER_BRONZE_CONTENT_TYPE.SETTLEMENT) {
      continue;
    }

    const payload = record.payload;
    if (!isRecord(payload)) {
      continue;
    }

    const result = payload.result;
    if (result !== "yes" && result !== "no") {
      continue;
    }

    matches.push({
      index,
      result,
      fieldPath: `bronzeRecords[${index}].payload.result`,
      ticker: readString(record, "ticker") ?? null,
    });
  }

  return matches;
}

export function readSnapshotSettlement(
  settlement: unknown,
): { present: boolean; value: string | null; fieldPath: string | null } {
  if (!isRecord(settlement)) {
    return { present: false, value: null, fieldPath: null };
  }

  const result = settlement.result;
  if (result === "yes" || result === "no") {
    return {
      present: true,
      value: result,
      fieldPath: "settlement.result",
    };
  }

  return { present: false, value: null, fieldPath: "settlement.result" };
}

export function safeParseJson(
  json: string,
  label: string,
): { ok: true; value: unknown } | { ok: false; error: string } {
  try {
    return { ok: true, value: JSON.parse(json) };
  } catch {
    return { ok: false, error: `${label} contains invalid JSON` };
  }
}

export function parseNestedJson(value: unknown, label: string): unknown {
  if (typeof value === "string") {
    const parsed = safeParseJson(value, label);
    if (!parsed.ok) {
      throw new Error(parsed.error);
    }

    return parsed.value;
  }

  return value;
}
