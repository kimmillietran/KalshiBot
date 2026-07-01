import { posix } from "node:path";

import {
  ResearchDatasetRegistryError,
  ResearchDatasetRegistryErrorCode,
} from "./researchDatasetRegistryTypes";

export const FIXTURE_FILENAME = "fixture.json";
export const IMPORT_METADATA_FILENAME = "metadata.json";
export const SERIES_REGISTRY_FILENAME = "dataset-registry.json";

export const INVALID_PATH_SEGMENT_PATTERN = /[<>:"/\\|?*\u0000-\u001f]/;
export const RESERVED_PATH_SEGMENT_PATTERN = /^(?:\.|\.\.)$/;

export function assertSafePathSegment(
  value: string,
  label: string,
  marketTicker?: string,
): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new ResearchDatasetRegistryError(
      `${label} is required`,
      ResearchDatasetRegistryErrorCode.BROKEN_FIXTURE_PATH,
      marketTicker,
    );
  }

  if (
    INVALID_PATH_SEGMENT_PATTERN.test(trimmed)
    || RESERVED_PATH_SEGMENT_PATTERN.test(trimmed)
  ) {
    throw new ResearchDatasetRegistryError(
      `${label} contains invalid path characters`,
      ResearchDatasetRegistryErrorCode.BROKEN_FIXTURE_PATH,
      marketTicker ?? trimmed,
    );
  }

  return trimmed;
}

export function buildResearchFixturePath(
  fixturesRoot: string,
  seriesTicker: string,
  marketTicker: string,
): string {
  const safeSeries = assertSafePathSegment(seriesTicker, "seriesTicker", marketTicker);
  const safeMarket = assertSafePathSegment(marketTicker, "marketTicker", marketTicker);
  return posix.join(
    fixturesRoot.replace(/\\/g, "/"),
    safeSeries,
    safeMarket,
    FIXTURE_FILENAME,
  );
}

export function buildImportMetadataPath(
  metadataRoot: string | null,
  seriesTicker: string,
  marketTicker: string,
): string | null {
  if (!metadataRoot?.trim()) {
    return null;
  }

  const safeSeries = assertSafePathSegment(seriesTicker, "seriesTicker", marketTicker);
  const safeMarket = assertSafePathSegment(marketTicker, "marketTicker", marketTicker);
  return posix.join(
    metadataRoot.replace(/\\/g, "/"),
    safeSeries,
    safeMarket,
    IMPORT_METADATA_FILENAME,
  );
}

export function buildSeriesRegistryOutputPath(
  outputRoot: string,
  seriesTicker: string,
): string {
  const safeSeries = assertSafePathSegment(seriesTicker, "seriesTicker");
  return posix.join(
    outputRoot.replace(/\\/g, "/"),
    safeSeries,
    SERIES_REGISTRY_FILENAME,
  );
}

export function compareRegistryEntries(
  left: { seriesTicker: string; marketTicker: string },
  right: { seriesTicker: string; marketTicker: string },
): number {
  const seriesCompare = left.seriesTicker.localeCompare(right.seriesTicker);
  if (seriesCompare !== 0) {
    return seriesCompare;
  }

  return left.marketTicker.localeCompare(right.marketTicker);
}

export function normalizeRootPath(root: string): string {
  return root.replace(/\\/g, "/").replace(/\/+$/, "");
}
