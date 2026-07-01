import { mkdirSync } from "node:fs";
import { posix } from "node:path";

import {
  DatasetRegistryError,
  DatasetRegistryErrorCode,
  type EnsureImportedMarketDirectoryInput,
  type ImportedMarketDatasetPaths,
} from "./importedMarketDatasetTypes";

export const INVALID_PATH_SEGMENT_PATTERN = /[<>:"/\\|?*\u0000-\u001f]/;
export const RESERVED_PATH_SEGMENT_PATTERN = /^(?:\.|\.\.)$/;

export function assertSafePathSegment(
  value: string,
  label: string,
  marketTicker?: string,
): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new DatasetRegistryError(
      `${label} is required`,
      DatasetRegistryErrorCode.BROKEN_DIRECTORY_STRUCTURE,
      marketTicker,
    );
  }

  if (
    INVALID_PATH_SEGMENT_PATTERN.test(trimmed)
    || RESERVED_PATH_SEGMENT_PATTERN.test(trimmed)
  ) {
    throw new DatasetRegistryError(
      `${label} contains invalid path characters`,
      DatasetRegistryErrorCode.BROKEN_DIRECTORY_STRUCTURE,
      marketTicker ?? trimmed,
    );
  }

  return trimmed;
}

export function buildImportedMarketDirectoryPath(
  importsRoot: string,
  seriesTicker: string,
  marketTicker: string,
): ImportedMarketDatasetPaths {
  const safeSeriesTicker = assertSafePathSegment(
    seriesTicker,
    "seriesTicker",
    marketTicker,
  );
  const safeMarketTicker = assertSafePathSegment(
    marketTicker,
    "marketTicker",
    marketTicker,
  );
  const directoryPath = posix.join(
    importsRoot.replace(/\\/g, "/"),
    safeSeriesTicker,
    safeMarketTicker,
  );

  return {
    directoryPath,
    configPath: posix.join(directoryPath, "config.json"),
    importResultPath: posix.join(directoryPath, "import-result.json"),
    metadataPath: posix.join(directoryPath, "metadata.json"),
  };
}

/** Creates the standardized per-market import directory layout. */
export function ensureImportedMarketDirectory(
  input: EnsureImportedMarketDirectoryInput,
): ImportedMarketDatasetPaths {
  const paths = buildImportedMarketDirectoryPath(
    input.importsRoot,
    input.seriesTicker,
    input.marketTicker,
  );

  mkdirSync(paths.directoryPath, { recursive: true });
  return paths;
}

export function compareMarketDatasetKeys(
  left: { seriesTicker: string; marketTicker: string },
  right: { seriesTicker: string; marketTicker: string },
): number {
  const seriesCompare = left.seriesTicker.localeCompare(right.seriesTicker);
  if (seriesCompare !== 0) {
    return seriesCompare;
  }

  return left.marketTicker.localeCompare(right.marketTicker);
}
