import { stableStringify } from "@/lib/trading/config/hashConfig";

import type {
  BuildHistoricalDatasetManifestInput,
  HistoricalDatasetManifest,
  HistoricalDatasetManifestGeneratedMetadata,
} from "./historicalDatasetManifestTypes";

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

function sortMarketTickers(tickers: Iterable<string>): readonly string[] {
  return Object.freeze([...new Set(tickers)].sort((left, right) => left.localeCompare(right)));
}

function resolveTimestampBounds(
  eventTimes: readonly string[],
): { earliestTimestamp: string; latestTimestamp: string } {
  if (eventTimes.length === 0) {
    return {
      earliestTimestamp: "",
      latestTimestamp: "",
    };
  }

  let earliestTimestamp = eventTimes[0]!;
  let latestTimestamp = eventTimes[0]!;

  for (const eventTime of eventTimes) {
    if (eventTime.localeCompare(earliestTimestamp) < 0) {
      earliestTimestamp = eventTime;
    }
    if (eventTime.localeCompare(latestTimestamp) > 0) {
      latestTimestamp = eventTime;
    }
  }

  return { earliestTimestamp, latestTimestamp };
}

function cloneGeneratedMetadata(
  generatedMetadata: HistoricalDatasetManifestGeneratedMetadata,
): HistoricalDatasetManifestGeneratedMetadata {
  return structuredClone(generatedMetadata);
}

/**
 * Summarizes a historical dataset into a deterministic metadata manifest.
 * Does not validate, build, replay, or execute research.
 */
export function buildHistoricalDatasetManifest(
  input: BuildHistoricalDatasetManifestInput,
): HistoricalDatasetManifest {
  const { dataset, generatedMetadata } = input;
  const marketTickers = sortMarketTickers(
    dataset.snapshots.map((snapshot) => snapshot.ticker),
  );
  const eventTimes = dataset.snapshots.map((snapshot) => snapshot.temporal.eventTime);
  const { earliestTimestamp, latestTimestamp } = resolveTimestampBounds(eventTimes);

  let btcBarCount = 0;
  let settlementCount = 0;

  for (const snapshot of dataset.snapshots) {
    btcBarCount += snapshot.btcBars.length;
    if (snapshot.settlement !== null) {
      settlementCount += 1;
    }
  }

  return deepFreeze({
    datasetId: dataset.metadata.datasetId,
    contractVersion: dataset.metadata.contractVersion,
    snapshotCount: dataset.metadata.snapshotCount,
    marketCount: marketTickers.length,
    marketTickers,
    earliestTimestamp,
    latestTimestamp,
    btcBarCount,
    marketWindowCount: dataset.snapshots.length,
    settlementCount,
    generatedMetadata: cloneGeneratedMetadata(generatedMetadata),
  });
}

export function serializeHistoricalDatasetManifest(
  manifest: HistoricalDatasetManifest,
): string {
  return stableStringify({
    datasetId: manifest.datasetId,
    contractVersion: manifest.contractVersion,
    snapshotCount: manifest.snapshotCount,
    marketCount: manifest.marketCount,
    marketTickers: [...manifest.marketTickers],
    earliestTimestamp: manifest.earliestTimestamp,
    latestTimestamp: manifest.latestTimestamp,
    btcBarCount: manifest.btcBarCount,
    marketWindowCount: manifest.marketWindowCount,
    settlementCount: manifest.settlementCount,
    generatedMetadata: manifest.generatedMetadata,
  });
}

export type {
  BuildHistoricalDatasetManifestInput,
  HistoricalDatasetManifest,
  HistoricalDatasetManifestGeneratedMetadata,
} from "./historicalDatasetManifestTypes";
