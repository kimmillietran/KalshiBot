import { SILVER_BRONZE_CONTENT_TYPE } from "@/lib/data/silver";
import type { RawHistoricalRecord } from "@/lib/data/types";
import { stableStringify } from "@/lib/trading/config/hashConfig";

import type {
  BuildImportedMarketMetadataInput,
  ImportedMarketMetadata,
} from "./importedMarketDatasetTypes";
import {
  DatasetRegistryError,
  DatasetRegistryErrorCode,
} from "./importedMarketDatasetTypes";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(
  record: Record<string, unknown>,
  ...keys: string[]
): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }

  return undefined;
}

function countKalshiCandles(records: readonly RawHistoricalRecord[]): number {
  return records.filter(
    (record) => record.contentType === SILVER_BRONZE_CONTENT_TYPE.CANDLESTICK,
  ).length;
}

function resolveEventTicker(
  marketTicker: string,
  records: readonly RawHistoricalRecord[],
): string {
  const marketRecord = records.find(
    (record) => record.contentType === SILVER_BRONZE_CONTENT_TYPE.MARKET,
  );

  if (marketRecord) {
    const payload = marketRecord.payload;
    if (isRecord(payload) && isRecord(payload.market)) {
      const eventTicker = readString(payload.market, "event_ticker", "eventTicker");
      if (eventTicker) {
        return eventTicker;
      }
    }

    if (isRecord(payload)) {
      const eventTicker = readString(payload, "event_ticker", "eventTicker");
      if (eventTicker) {
        return eventTicker;
      }
    }
  }

  const parts = marketTicker.split("-");
  if (parts.length >= 2) {
    return parts.slice(0, -1).join("-");
  }

  return marketTicker;
}

function resolveSeriesTicker(marketTicker: string): string {
  const [seriesTicker] = marketTicker.split("-");
  return seriesTicker?.trim() || marketTicker;
}

function deriveImportDurationMs(records: readonly RawHistoricalRecord[]): number {
  const observedTimes = records
    .map((record) => Date.parse(record.observedAt))
    .filter((value) => Number.isFinite(value));

  if (observedTimes.length < 2) {
    return 0;
  }

  return Math.max(...observedTimes) - Math.min(...observedTimes);
}

function collectProvenanceSources(
  records: readonly RawHistoricalRecord[],
): readonly string[] {
  return [...new Set(records.map((record) => record.provenance.source))].sort();
}

/** Builds deterministic per-market metadata from import artifacts. */
export function buildImportedMarketMetadata(
  input: BuildImportedMarketMetadataInput,
): ImportedMarketMetadata {
  const { config, importResult } = input;
  const marketTicker = config.marketTicker;

  if (importResult.metadata.marketTicker !== marketTicker) {
    throw new DatasetRegistryError(
      "import-result.json marketTicker does not match config.json",
      DatasetRegistryErrorCode.MANIFEST_INCONSISTENCY,
      marketTicker,
    );
  }

  const bronzeRecords = importResult.bronzeRecords;
  const statistics = importResult.validationResult.statistics;

  return {
    marketTicker,
    eventTicker: resolveEventTicker(marketTicker, bronzeRecords),
    seriesTicker: resolveSeriesTicker(marketTicker),
    importTimestamp: importResult.metadata.observedAt,
    sourceProviders: {
      kalshi: {
        marketSource: config.kalshi.marketSource,
        candleSource: config.kalshi.candleSource,
        settlementSource: config.kalshi.settlementSource,
      },
      btc: config.btc
        ? {
            provider: config.btc.provider,
            symbol: config.btc.symbol,
            interval: config.btc.interval,
          }
        : null,
    },
    bronzeRecordCount: statistics.totalRecords,
    btcBarCount: statistics.btcBarCount,
    kalshiCandleCount: countKalshiCandles(bronzeRecords),
    settlementPresent: statistics.settlementCount > 0,
    validationStatus: {
      valid: importResult.validationResult.valid,
      errorCount: importResult.validationResult.errors.length,
      warningCount: importResult.validationResult.warnings.length,
    },
    provenance: {
      jobId: importResult.jobId,
      importTimestamp: importResult.metadata.observedAt,
      sources: collectProvenanceSources(bronzeRecords),
    },
    importDurationMs: deriveImportDurationMs(bronzeRecords),
  };
}

/** Serializes per-market metadata to stable JSON. */
export function serializeImportedMarketMetadata(
  metadata: ImportedMarketMetadata,
): string {
  return stableStringify(metadata);
}

function assertPlainObject(
  value: unknown,
  label: string,
): asserts value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new DatasetRegistryError(
      `${label} must be a plain object`,
      DatasetRegistryErrorCode.INVALID_METADATA,
    );
  }
}

/** Parses and validates per-market metadata JSON. */
export function parseImportedMarketMetadataJson(json: string): ImportedMarketMetadata {
  let parsed: unknown;

  try {
    parsed = JSON.parse(json);
  } catch {
    throw new DatasetRegistryError(
      "metadata.json contains invalid JSON",
      DatasetRegistryErrorCode.INVALID_METADATA,
    );
  }

  assertPlainObject(parsed, "metadata.json");

  const requiredStrings = [
    "marketTicker",
    "eventTicker",
    "seriesTicker",
    "importTimestamp",
  ] as const;

  for (const field of requiredStrings) {
    if (typeof parsed[field] !== "string" || !parsed[field].trim()) {
      throw new DatasetRegistryError(
        `metadata.json ${field} is required`,
        DatasetRegistryErrorCode.INVALID_METADATA,
        typeof parsed.marketTicker === "string" ? parsed.marketTicker : undefined,
      );
    }
  }

  assertPlainObject(parsed.sourceProviders, "metadata.json sourceProviders");
  assertPlainObject(parsed.sourceProviders.kalshi, "metadata.json sourceProviders.kalshi");
  if (
    parsed.sourceProviders.btc !== null
    && parsed.sourceProviders.btc !== undefined
  ) {
    assertPlainObject(parsed.sourceProviders.btc, "metadata.json sourceProviders.btc");
  }
  assertPlainObject(parsed.validationStatus, "metadata.json validationStatus");
  assertPlainObject(parsed.provenance, "metadata.json provenance");

  const numericFields = [
    "bronzeRecordCount",
    "btcBarCount",
    "kalshiCandleCount",
    "importDurationMs",
  ] as const;

  for (const field of numericFields) {
    if (typeof parsed[field] !== "number" || !Number.isFinite(parsed[field])) {
      throw new DatasetRegistryError(
        `metadata.json ${field} must be a finite number`,
        DatasetRegistryErrorCode.INVALID_METADATA,
        parsed.marketTicker as string,
      );
    }
  }

  if (typeof parsed.settlementPresent !== "boolean") {
    throw new DatasetRegistryError(
      "metadata.json settlementPresent must be a boolean",
      DatasetRegistryErrorCode.INVALID_METADATA,
      parsed.marketTicker as string,
    );
  }

  if (typeof parsed.validationStatus.valid !== "boolean") {
    throw new DatasetRegistryError(
      "metadata.json validationStatus.valid must be a boolean",
      DatasetRegistryErrorCode.INVALID_METADATA,
      parsed.marketTicker as string,
    );
  }

  return parsed as ImportedMarketMetadata;
}
