import { validateHistoricalBronzeDataset } from "@/lib/data/datasets/validation";
import { computeBidAskFidelityFromBronzeRecords } from "@/lib/data/datasets/validation/audit";
import { DATASET_BRONZE_CONTENT_TYPE } from "@/lib/data/datasets/datasetTypes";
import { SILVER_BRONZE_CONTENT_TYPE } from "@/lib/data/silver";
import type { RawHistoricalRecord } from "@/lib/data/types";

import type {
  BidAskFidelitySummary,
  ParsedResearchFixture,
  ResearchDatasetProvenanceSummary,
  ResearchDatasetValidationStatus,
} from "./researchDatasetRegistryTypes";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(
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

function countByContentType(
  records: readonly RawHistoricalRecord[],
  contentType: string,
): number {
  return records.filter((record) => record.contentType === contentType).length;
}

function resolveMarketCloseTime(
  records: readonly RawHistoricalRecord[],
): string | null {
  const marketRecord = records.find(
    (record) => record.contentType === SILVER_BRONZE_CONTENT_TYPE.MARKET,
  );

  if (!marketRecord) {
    return null;
  }

  const payload = marketRecord.payload;
  if (isRecord(payload) && isRecord(payload.market)) {
    const closeTime = readString(payload.market, "close_time", "closeTime");
    if (closeTime) {
      return closeTime;
    }
  }

  if (isRecord(payload)) {
    const closeTime = readString(payload, "close_time", "closeTime");
    if (closeTime) {
      return closeTime;
    }
  }

  return null;
}

function collectProvenanceSources(
  records: readonly RawHistoricalRecord[],
): readonly string[] {
  return [...new Set(records.map((record) => record.provenance.source))].sort();
}

export type ResearchFixtureSummary = {
  bronzeRecordCount: number;
  btcBarCount: number;
  kalshiCandleCount: number;
  settlementPresent: boolean;
  marketCloseTime: string | null;
  validationStatus: ResearchDatasetValidationStatus;
  bidAskFidelity: BidAskFidelitySummary;
  provenance: ResearchDatasetProvenanceSummary;
};

/** Derives registry summary fields from a validated research fixture. */
export function buildResearchFixtureSummary(
  fixture: ParsedResearchFixture,
): ResearchFixtureSummary {
  const records = fixture.bronzeRecords;
  const validation = validateHistoricalBronzeDataset(records);
  const bidAskFidelity = computeBidAskFidelityFromBronzeRecords(records);

  return {
    bronzeRecordCount: records.length,
    btcBarCount: countByContentType(records, DATASET_BRONZE_CONTENT_TYPE.BTC_KLINE),
    kalshiCandleCount: countByContentType(
      records,
      SILVER_BRONZE_CONTENT_TYPE.CANDLESTICK,
    ),
    settlementPresent: validation.statistics.settlementCount > 0,
    marketCloseTime: resolveMarketCloseTime(records),
    validationStatus: {
      valid: validation.valid,
      errorCount: validation.errors.length,
      warningCount: validation.warnings.length,
    },
    bidAskFidelity,
    provenance: {
      runId: fixture.runId,
      strategyId: fixture.strategyId,
      sources: collectProvenanceSources(records),
    },
  };
}
