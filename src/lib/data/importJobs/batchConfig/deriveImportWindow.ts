import { isUtcIsoTimestamp } from "@/lib/data/timestamps";
import type { DiscoveredMarket } from "@/lib/data/discovery";

import {
  BatchImportConfigError,
  BatchImportConfigErrorCode,
  type ImportWindowTimestamps,
} from "./batchImportConfigTypes";

export const POST_CLOSE_COLLECTION_OFFSET_MS = 10_000;

function requireUtcTimestamp(
  value: string | null,
  label: string,
  marketTicker: string,
): string {
  if (!value) {
    throw new BatchImportConfigError(
      `${label} is required to derive the import window`,
      BatchImportConfigErrorCode.MISSING_IMPORT_WINDOW_TIMESTAMPS,
      marketTicker,
    );
  }

  if (!isUtcIsoTimestamp(value)) {
    throw new BatchImportConfigError(
      `${label} must be a valid UTC ISO-8601 instant with Z suffix`,
      BatchImportConfigErrorCode.MISSING_IMPORT_WINDOW_TIMESTAMPS,
      marketTicker,
    );
  }

  return value;
}

function addMilliseconds(isoTimestamp: string, offsetMs: number): string {
  const parsedMs = Date.parse(isoTimestamp);
  if (!Number.isFinite(parsedMs)) {
    throw new BatchImportConfigError(
      "Timestamp could not be parsed for import window derivation",
      BatchImportConfigErrorCode.MISSING_IMPORT_WINDOW_TIMESTAMPS,
    );
  }

  return new Date(parsedMs + offsetMs).toISOString();
}

/** Derives shared Kalshi/BTC import timestamps from discovered market metadata. */
export function deriveImportWindowFromDiscoveredMarket(
  market: DiscoveredMarket,
): ImportWindowTimestamps {
  const startTime = requireUtcTimestamp(
    market.openTime,
    "openTime",
    market.marketTicker,
  );
  const endTime = requireUtcTimestamp(
    market.closeTime,
    "closeTime",
    market.marketTicker,
  );

  if (Date.parse(startTime) >= Date.parse(endTime)) {
    throw new BatchImportConfigError(
      "openTime must be before closeTime for import window derivation",
      BatchImportConfigErrorCode.MISSING_IMPORT_WINDOW_TIMESTAMPS,
      market.marketTicker,
    );
  }

  const collectionTime = addMilliseconds(endTime, POST_CLOSE_COLLECTION_OFFSET_MS);
  const observedAt = collectionTime;

  return {
    startTime,
    endTime,
    collectionTime,
    observedAt,
  };
}
