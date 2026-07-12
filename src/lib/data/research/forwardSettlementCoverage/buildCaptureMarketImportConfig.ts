import { posix } from "node:path";

import {
  HistoricalBronzeImportBtcInterval,
  HistoricalBronzeImportBtcProvider,
  HistoricalBronzeImportKalshiSource,
  HistoricalBronzeImportOutputFormat,
  buildHistoricalBronzeImportConfig,
} from "@/lib/data/importJobs/config";
import type { HistoricalBronzeImportConfig } from "@/lib/data/importJobs/config";
import { buildImportedMarketDirectoryPath } from "@/lib/data/datasets/registry/importedMarketDatasetPaths";
import { resolveSeriesTicker } from "@/lib/data/audit/settlementTrace/settlementTraceUtils";

import type { CapturedMarketInventoryEntry } from "./forwardSettlementCoverageTypes";

const POST_CLOSE_COLLECTION_OFFSET_MS = 10_000;
const MIN_IMPORT_WINDOW_MS = 1_000;

function addMilliseconds(isoTimestamp: string, offsetMs: number): string {
  return new Date(Date.parse(isoTimestamp) + offsetMs).toISOString();
}

function ensureImportWindowEndTime(input: {
  startTime: string;
  endTime: string;
  lastObservedAt: string;
}): string {
  const startMs = Date.parse(input.startTime);
  let endMs = Date.parse(input.endTime);

  if (!Number.isFinite(endMs) || endMs <= startMs) {
    endMs = Date.parse(input.lastObservedAt);
  }

  if (!Number.isFinite(endMs) || endMs <= startMs) {
    return addMilliseconds(input.startTime, MIN_IMPORT_WINDOW_MS);
  }

  return new Date(endMs).toISOString();
}

function requireTimestamp(value: string | null, fallback: string): string {
  if (!value || !Number.isFinite(Date.parse(value))) {
    return fallback;
  }

  return value;
}

/** Builds a historical bronze import config for one captured market. */
export function buildCaptureMarketImportConfig(input: {
  market: CapturedMarketInventoryEntry;
  evaluatedAt: string;
}): HistoricalBronzeImportConfig {
  const startTime = requireTimestamp(
    input.market.firstObservedAt,
    input.market.firstObservedAt,
  );
  const endTime = ensureImportWindowEndTime({
    startTime,
    endTime: requireTimestamp(
      input.market.marketCloseTime ?? input.market.lastObservedAt,
      input.market.lastObservedAt,
    ),
    lastObservedAt: requireTimestamp(
      input.market.lastObservedAt,
      input.market.firstObservedAt,
    ),
  });
  const collectionTime = addMilliseconds(
    requireTimestamp(input.market.marketCloseTime, endTime),
    POST_CLOSE_COLLECTION_OFFSET_MS,
  );

  return buildHistoricalBronzeImportConfig({
    jobId: `forward-settlement-backfill-${input.market.marketTicker}`,
    marketTicker: input.market.marketTicker,
    startTime,
    endTime,
    collectionTime,
    observedAt: input.evaluatedAt,
    kalshi: {
      marketSource: HistoricalBronzeImportKalshiSource.KALSHI_REST,
      candleSource: HistoricalBronzeImportKalshiSource.KALSHI_CANDLES,
      settlementSource: HistoricalBronzeImportKalshiSource.KALSHI_REST,
    },
    btc: {
      provider: HistoricalBronzeImportBtcProvider.BINANCE_SPOT,
      symbol: "BTCUSDT",
      interval: HistoricalBronzeImportBtcInterval.ONE_MINUTE,
    },
    output: {
      format: HistoricalBronzeImportOutputFormat.JSON,
      includeValidationReport: true,
      includeFixture: false,
    },
    metadata: {
      forwardSettlementBackfill: true,
      captureRunObservationStart: input.market.firstObservedAt,
      captureRunObservationEnd: input.market.lastObservedAt,
    },
  });
}

export function resolveMarketImportPaths(input: {
  importsDir: string;
  market: CapturedMarketInventoryEntry;
}): {
  directoryPath: string;
  configPath: string;
  importResultPath: string;
  metadataPath: string;
} {
  const seriesTicker = resolveSeriesTicker(input.market.marketTicker);
  const paths = buildImportedMarketDirectoryPath(
    input.importsDir,
    seriesTicker,
    input.market.marketTicker,
  );

  return {
    directoryPath: paths.directoryPath,
    configPath: paths.configPath,
    importResultPath: paths.importResultPath,
    metadataPath: paths.metadataPath,
  };
}

export function buildForwardSettlementBackfillJobId(
  marketTicker: string,
): string {
  return `forward-settlement-backfill-${marketTicker}`;
}

export function normalizeCaptureRunDir(captureRunDir: string): string {
  return captureRunDir.replace(/\\/g, "/");
}

export function joinPosix(...parts: string[]): string {
  return posix.join(...parts);
}
