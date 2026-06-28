import { cloneBronzeRecord } from "@/lib/data/bronze";
import {
  serializeHistoricalBronzeValidation,
  validateHistoricalBronzeDataset,
} from "@/lib/data/datasets/validation";
import type { RawHistoricalRecord } from "@/lib/data/types";
import { stableStringify } from "@/lib/trading/config/hashConfig";

import type {
  HistoricalBronzeImportJobCoreResult,
  HistoricalBronzeImportJobResult,
  HistoricalBronzeProviderImportInput,
  RunHistoricalBronzeImportJobInput,
} from "./historicalBronzeImportJobTypes";

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object") {
    return value;
  }

  Object.freeze(value);

  if (Array.isArray(value)) {
    for (const item of value) {
      deepFreeze(item);
    }
  } else {
    for (const nested of Object.values(value)) {
      deepFreeze(nested);
    }
  }

  return value;
}

function compareBronzeRecords(
  left: RawHistoricalRecord,
  right: RawHistoricalRecord,
): number {
  const byEventTime = left.eventTime.localeCompare(right.eventTime);
  if (byEventTime !== 0) {
    return byEventTime;
  }

  const byCollectionTime = left.collectionTime.localeCompare(right.collectionTime);
  if (byCollectionTime !== 0) {
    return byCollectionTime;
  }

  const byTicker = left.ticker.localeCompare(right.ticker);
  if (byTicker !== 0) {
    return byTicker;
  }

  const byContentType = left.contentType.localeCompare(right.contentType);
  if (byContentType !== 0) {
    return byContentType;
  }

  return left.recordId.localeCompare(right.recordId);
}

function sortBronzeRecords(
  records: readonly RawHistoricalRecord[],
): readonly RawHistoricalRecord[] {
  return Object.freeze(
    [...records]
      .map((record) => cloneBronzeRecord(record))
      .sort(compareBronzeRecords),
  );
}

function buildProviderInput(
  input: RunHistoricalBronzeImportJobInput,
): HistoricalBronzeProviderImportInput {
  return {
    marketTicker: input.marketTicker,
    startTime: input.startTime,
    endTime: input.endTime,
    collectionTime: input.collectionTime,
    observedAt: input.observedAt,
  };
}

/**
 * Orchestrates Kalshi and BTC historical providers into a bronze record set,
 * validates the combined dataset, and returns a deterministic frozen result.
 */
export function runHistoricalBronzeImportJob(
  input: RunHistoricalBronzeImportJobInput,
): HistoricalBronzeImportJobResult {
  const providerInput = buildProviderInput(input);

  const marketRecords = input.kalshiProvider.importKalshiMarketRecords(providerInput);
  const candleRecords = input.kalshiProvider.importKalshiCandleRecords(providerInput);
  const settlementRecords = input.kalshiProvider.importKalshiSettlementRecords(providerInput);
  const btcRecords = input.btcProvider.importBtcKlineRecords(providerInput);

  const bronzeRecords = sortBronzeRecords([
    ...marketRecords,
    ...candleRecords,
    ...settlementRecords,
    ...btcRecords,
  ]);

  const validationResult = validateHistoricalBronzeDataset(bronzeRecords);

  const coreResult: HistoricalBronzeImportJobCoreResult = {
    jobId: input.jobId,
    bronzeRecords,
    validationResult,
    metadata: {
      jobId: input.jobId,
      marketTicker: input.marketTicker,
      startTime: input.startTime,
      endTime: input.endTime,
      collectionTime: input.collectionTime,
      observedAt: input.observedAt,
      bronzeRecordCount: bronzeRecords.length,
      valid: validationResult.valid,
    },
  };

  return deepFreeze({
    ...coreResult,
    serialized: serializeHistoricalBronzeImportResult(coreResult),
  });
}

export function serializeHistoricalBronzeImportResult(
  result: HistoricalBronzeImportJobCoreResult,
): string {
  return stableStringify({
    jobId: result.jobId,
    bronzeRecords: result.bronzeRecords.map((record) => ({
      recordId: record.recordId,
      ticker: record.ticker,
      contentType: record.contentType,
      eventTime: record.eventTime,
      collectionTime: record.collectionTime,
      observedAt: record.observedAt,
      payload: record.payload,
      provenance: record.provenance,
    })),
    validationResult: JSON.parse(
      serializeHistoricalBronzeValidation(result.validationResult),
    ) as HistoricalBronzeImportJobCoreResult["validationResult"],
    metadata: result.metadata,
  });
}

export type {
  BtcHistoricalBronzeProvider,
  HistoricalBronzeImportJobCoreResult,
  HistoricalBronzeImportJobMetadata,
  HistoricalBronzeImportJobResult,
  HistoricalBronzeProviderImportInput,
  KalshiHistoricalBronzeProvider,
  RunHistoricalBronzeImportJobInput,
} from "./historicalBronzeImportJobTypes";
