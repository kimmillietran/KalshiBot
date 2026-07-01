import { posix } from "node:path";

import { stableStringify } from "@/lib/trading/config/hashConfig";

import {
  buildImportedMarketMetadata,
  parseImportedMarketMetadataJson,
} from "./buildImportedMarketMetadata";
import {
  assertSafePathSegment,
  buildImportedMarketDirectoryPath,
  compareMarketDatasetKeys,
} from "./importedMarketDatasetPaths";
import {
  parseImportedMarketConfigJson,
  parseImportedMarketResultJson,
} from "./parseImportedMarketArtifacts";
import {
  DatasetRegistryError,
  DatasetRegistryErrorCode,
  ImportedMarketDatasetStatus,
  type BuildDatasetManifestInput,
  type DatasetManifest,
  type DatasetManifestEntry,
  type DatasetManifestSummary,
  type DatasetRegistryIo,
  type ScannedImportedMarketDataset,
} from "./importedMarketDatasetTypes";

function normalizeInputDir(inputDir: string): string {
  return inputDir.replace(/\\/g, "/").replace(/\/+$/, "");
}

function buildDatasetKey(seriesTicker: string, marketTicker: string): string {
  return `${seriesTicker}/${marketTicker}`;
}

function resolveImportStatus(
  files: ScannedImportedMarketDataset["files"],
): DatasetManifestEntry["importStatus"] {
  if (!files.config) {
    return ImportedMarketDatasetStatus.MISSING_CONFIG;
  }

  if (!files.importResult) {
    return ImportedMarketDatasetStatus.MISSING_IMPORT_RESULT;
  }

  if (!files.metadata) {
    return ImportedMarketDatasetStatus.MISSING_METADATA;
  }

  return ImportedMarketDatasetStatus.COMPLETE;
}

function buildSummaryFromMetadata(
  metadata: ReturnType<typeof buildImportedMarketMetadata>,
): DatasetManifestEntry["summary"] {
  return {
    bronzeRecordCount: metadata.bronzeRecordCount,
    btcBarCount: metadata.btcBarCount,
    kalshiCandleCount: metadata.kalshiCandleCount,
    settlementPresent: metadata.settlementPresent,
    validationValid: metadata.validationStatus.valid,
  };
}

function buildManifestEntry(
  scanned: ScannedImportedMarketDataset,
): DatasetManifestEntry {
  const importStatus = resolveImportStatus(scanned.files);

  if (importStatus === ImportedMarketDatasetStatus.MISSING_IMPORT_RESULT) {
    throw new DatasetRegistryError(
      `Missing import-result.json for ${scanned.marketTicker}`,
      DatasetRegistryErrorCode.MISSING_IMPORT_RESULT,
      scanned.marketTicker,
    );
  }

  if (!scanned.files.config || !scanned.files.importResult) {
    throw new DatasetRegistryError(
      `Broken directory structure for ${scanned.marketTicker}`,
      DatasetRegistryErrorCode.BROKEN_DIRECTORY_STRUCTURE,
      scanned.marketTicker,
    );
  }

  const config = parseImportedMarketConfigJson(scanned.files.config);
  const importResult = parseImportedMarketResultJson(scanned.files.importResult);
  const generatedMetadata = buildImportedMarketMetadata({ config, importResult });

  if (scanned.files.metadata) {
    const parsedMetadata = parseImportedMarketMetadataJson(scanned.files.metadata);
    if (parsedMetadata.marketTicker !== generatedMetadata.marketTicker) {
      throw new DatasetRegistryError(
        "metadata.json marketTicker does not match import artifacts",
        DatasetRegistryErrorCode.INVALID_METADATA,
        scanned.marketTicker,
      );
    }
  }

  if (config.marketTicker !== scanned.marketTicker) {
    throw new DatasetRegistryError(
      "config.json marketTicker does not match directory name",
      DatasetRegistryErrorCode.MANIFEST_INCONSISTENCY,
      scanned.marketTicker,
    );
  }

  return {
    seriesTicker: scanned.seriesTicker,
    marketTicker: scanned.marketTicker,
    directoryPath: scanned.paths.directoryPath,
    configPath: scanned.paths.configPath,
    importResultPath: scanned.paths.importResultPath,
    metadataPath: scanned.paths.metadataPath,
    importStatus,
    summary: buildSummaryFromMetadata(generatedMetadata),
  };
}

function buildManifestSummary(
  markets: readonly DatasetManifestEntry[],
): DatasetManifestSummary {
  return {
    marketCount: markets.length,
    completeMarketCount: markets.filter(
      (market) => market.importStatus === ImportedMarketDatasetStatus.COMPLETE,
    ).length,
    totalBronzeRecords: markets.reduce(
      (total, market) => total + market.summary.bronzeRecordCount,
      0,
    ),
    totalBtcBars: markets.reduce(
      (total, market) => total + market.summary.btcBarCount,
      0,
    ),
    totalKalshiCandles: markets.reduce(
      (total, market) => total + market.summary.kalshiCandleCount,
      0,
    ),
    settlementMarketCount: markets.filter(
      (market) => market.summary.settlementPresent,
    ).length,
  };
}

/** Builds a deterministic dataset manifest from scanned import directories. */
export function buildDatasetManifest(
  input: BuildDatasetManifestInput,
): DatasetManifest {
  const sortedEntries = [...input.entries].sort(compareMarketDatasetKeys);
  const seenKeys = new Set<string>();

  for (const entry of sortedEntries) {
    const datasetKey = buildDatasetKey(entry.seriesTicker, entry.marketTicker);
    if (seenKeys.has(datasetKey)) {
      throw new DatasetRegistryError(
        `Duplicate market directory: ${datasetKey}`,
        DatasetRegistryErrorCode.DUPLICATE_MARKET_DIRECTORY,
        entry.marketTicker,
      );
    }
    seenKeys.add(datasetKey);
  }

  const markets = sortedEntries.map(buildManifestEntry);
  const summary = buildManifestSummary(markets);

  if (summary.marketCount !== markets.length) {
    throw new DatasetRegistryError(
      "Manifest summary marketCount is inconsistent",
      DatasetRegistryErrorCode.MANIFEST_INCONSISTENCY,
    );
  }

  return {
    generatedAt: input.generatedAt,
    inputDir: normalizeInputDir(input.inputDir),
    markets,
    summary,
  };
}

/** Serializes a dataset manifest to stable JSON. */
export function serializeDatasetManifest(manifest: DatasetManifest): string {
  return stableStringify(manifest);
}

/** Scans an imports root for standardized per-market dataset directories. */
export function scanImportedMarketDatasets(
  inputDir: string,
  io: DatasetRegistryIo,
): ScannedImportedMarketDataset[] {
  const importsRoot = normalizeInputDir(inputDir);

  if (!io.isDirectory(importsRoot)) {
    throw new DatasetRegistryError(
      `Input directory does not exist: ${importsRoot}`,
      DatasetRegistryErrorCode.BROKEN_DIRECTORY_STRUCTURE,
    );
  }

  const seenKeys = new Map<string, string>();
  const scanned: ScannedImportedMarketDataset[] = [];

  for (const seriesTickerRaw of [...io.readdir(importsRoot)].sort()) {
    const seriesTicker = assertSafePathSegment(seriesTickerRaw, "seriesTicker");
    const seriesPath = posix.join(importsRoot, seriesTicker);

    if (!io.isDirectory(seriesPath)) {
      continue;
    }

    for (const marketTickerRaw of [...io.readdir(seriesPath)].sort()) {
      const marketTicker = assertSafePathSegment(
        marketTickerRaw,
        "marketTicker",
        marketTickerRaw,
      );
      const datasetKey = buildDatasetKey(seriesTicker, marketTicker);
      const existingTicker = seenKeys.get(datasetKey);

      if (existingTicker !== undefined) {
        throw new DatasetRegistryError(
          `Duplicate market directory: ${datasetKey}`,
          DatasetRegistryErrorCode.DUPLICATE_MARKET_DIRECTORY,
          marketTicker,
        );
      }

      seenKeys.set(datasetKey, marketTicker);
      const paths = buildImportedMarketDirectoryPath(
        importsRoot,
        seriesTicker,
        marketTicker,
      );

      scanned.push({
        seriesTicker,
        marketTicker,
        paths,
        files: {
          ...(io.fileExists(paths.configPath)
            ? { config: io.readFile(paths.configPath) }
            : {}),
          ...(io.fileExists(paths.importResultPath)
            ? { importResult: io.readFile(paths.importResultPath) }
            : {}),
          ...(io.fileExists(paths.metadataPath)
            ? { metadata: io.readFile(paths.metadataPath) }
            : {}),
        },
      });
    }
  }

  return scanned;
}

/** Scans imports and builds a dataset manifest in one step. */
export function buildDatasetManifestFromDirectory(
  inputDir: string,
  io: DatasetRegistryIo,
  options: { generatedAt: string },
): DatasetManifest {
  const entries = scanImportedMarketDatasets(inputDir, io);
  return buildDatasetManifest({
    inputDir,
    generatedAt: options.generatedAt,
    entries,
  });
}
