import { posix } from "node:path";

import { stableStringify } from "@/lib/trading/config/hashConfig";

import { buildResearchFixtureSummary } from "./buildResearchFixtureSummary";
import { parseLinkedImportMetadataJson } from "./linkImportMetadata";
import { parseResearchFixtureJson } from "./parseResearchFixtureJson";
import {
  assertSafePathSegment,
  buildImportMetadataPath,
  buildResearchFixturePath,
  buildSeriesRegistryOutputPath,
  compareRegistryEntries,
  FIXTURE_FILENAME,
  normalizeRootPath,
} from "./researchDatasetRegistryPaths";
import {
  ResearchDatasetRegistryError,
  ResearchDatasetRegistryErrorCode,
  type BuildResearchDatasetRegistryInput,
  type ResearchDatasetRegistryEntry,
  type ResearchDatasetRegistryIo,
  type ResearchDatasetRegistrySummary,
  type ResearchDatasetSeriesRegistry,
  type ScannedResearchFixture,
} from "./researchDatasetRegistryTypes";

function buildDatasetKey(seriesTicker: string, marketTicker: string): string {
  return `${seriesTicker}/${marketTicker}`;
}

function buildRegistryEntry(
  scanned: ScannedResearchFixture,
): ResearchDatasetRegistryEntry {
  if (!scanned.fixtureJson) {
    throw new ResearchDatasetRegistryError(
      `Missing ${FIXTURE_FILENAME} for ${scanned.marketTicker}`,
      ResearchDatasetRegistryErrorCode.MISSING_FIXTURE,
      scanned.marketTicker,
    );
  }

  const fixture = parseResearchFixtureJson(scanned.fixtureJson, scanned.marketTicker);
  const summary = buildResearchFixtureSummary(fixture);
  const importMetadata = parseLinkedImportMetadataJson(
    scanned.metadataJson,
    scanned.marketTicker,
  );

  if (fixture.bronzeRecords[0]?.ticker && fixture.bronzeRecords[0].ticker !== scanned.marketTicker) {
    throw new ResearchDatasetRegistryError(
      "fixture.json bronze ticker does not match directory name",
      ResearchDatasetRegistryErrorCode.REGISTRY_INCONSISTENCY,
      scanned.marketTicker,
    );
  }

  return {
    seriesTicker: scanned.seriesTicker,
    marketTicker: scanned.marketTicker,
    fixturePath: scanned.fixturePath,
    metadataPath: scanned.metadataPath,
    marketCloseTime: summary.marketCloseTime,
    settlementPresent: summary.settlementPresent,
    bronzeRecordCount: summary.bronzeRecordCount,
    btcBarCount: summary.btcBarCount,
    kalshiCandleCount: summary.kalshiCandleCount,
    validationStatus: summary.validationStatus,
    provenance: summary.provenance,
    importMetadata,
  };
}

function buildRegistrySummary(
  markets: readonly ResearchDatasetRegistryEntry[],
): ResearchDatasetRegistrySummary {
  return {
    marketCount: markets.length,
    linkedMetadataCount: markets.filter((market) => market.importMetadata !== null).length,
    totalBronzeRecords: markets.reduce(
      (total, market) => total + market.bronzeRecordCount,
      0,
    ),
    totalBtcBars: markets.reduce((total, market) => total + market.btcBarCount, 0),
    totalKalshiCandles: markets.reduce(
      (total, market) => total + market.kalshiCandleCount,
      0,
    ),
    settlementMarketCount: markets.filter((market) => market.settlementPresent).length,
    validFixtureCount: markets.filter((market) => market.validationStatus.valid).length,
  };
}

function buildSeriesRegistry(
  seriesTicker: string,
  markets: readonly ResearchDatasetRegistryEntry[],
  input: BuildResearchDatasetRegistryInput,
): ResearchDatasetSeriesRegistry {
  const summary = buildRegistrySummary(markets);

  if (summary.marketCount !== markets.length) {
    throw new ResearchDatasetRegistryError(
      "Registry summary marketCount is inconsistent",
      ResearchDatasetRegistryErrorCode.REGISTRY_INCONSISTENCY,
    );
  }

  return {
    generatedAt: input.generatedAt,
    seriesTicker,
    fixturesRoot: normalizeRootPath(input.fixturesRoot),
    metadataRoot: input.metadataRoot ? normalizeRootPath(input.metadataRoot) : null,
    markets,
    summary,
  };
}

/** Builds deterministic per-series research dataset registries. */
export function buildResearchDatasetRegistries(
  input: BuildResearchDatasetRegistryInput,
): readonly ResearchDatasetSeriesRegistry[] {
  const sorted = [...input.scanned].sort(compareRegistryEntries);
  const seenKeys = new Set<string>();

  for (const fixture of sorted) {
    const key = buildDatasetKey(fixture.seriesTicker, fixture.marketTicker);
    if (seenKeys.has(key)) {
      throw new ResearchDatasetRegistryError(
        `Duplicate market ticker: ${key}`,
        ResearchDatasetRegistryErrorCode.DUPLICATE_MARKET_TICKER,
        fixture.marketTicker,
      );
    }
    seenKeys.add(key);
  }

  if (sorted.length === 0) {
    throw new ResearchDatasetRegistryError(
      "No replay-ready fixture datasets were discovered",
      ResearchDatasetRegistryErrorCode.EMPTY_DATASET,
    );
  }

  const entries = sorted.map(buildRegistryEntry);
  const bySeries = new Map<string, ResearchDatasetRegistryEntry[]>();

  for (const entry of entries) {
    const seriesEntries = bySeries.get(entry.seriesTicker) ?? [];
    seriesEntries.push(entry);
    bySeries.set(entry.seriesTicker, seriesEntries);
  }

  return [...bySeries.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([seriesTicker, markets]) =>
      buildSeriesRegistry(seriesTicker, markets, input),
    );
}

/** Serializes a series registry to stable JSON. */
export function serializeResearchDatasetSeriesRegistry(
  registry: ResearchDatasetSeriesRegistry,
): string {
  return stableStringify(registry);
}

/** Scans fixture and optional import metadata directories. */
export function scanResearchFixtures(
  fixturesRoot: string,
  metadataRoot: string | null,
  io: ResearchDatasetRegistryIo,
): ScannedResearchFixture[] {
  const normalizedFixturesRoot = normalizeRootPath(fixturesRoot);

  if (!io.isDirectory(normalizedFixturesRoot)) {
    throw new ResearchDatasetRegistryError(
      `Fixture directory does not exist: ${normalizedFixturesRoot}`,
      ResearchDatasetRegistryErrorCode.MISSING_FIXTURES_DIRECTORY,
    );
  }

  const scanned: ScannedResearchFixture[] = [];
  const seenKeys = new Map<string, string>();

  for (const seriesTickerRaw of [...io.readdir(normalizedFixturesRoot)].sort()) {
    const seriesTicker = assertSafePathSegment(seriesTickerRaw, "seriesTicker");
    const seriesPath = posix.join(normalizedFixturesRoot, seriesTicker);

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
      const existing = seenKeys.get(datasetKey);

      if (existing !== undefined) {
        throw new ResearchDatasetRegistryError(
          `Duplicate market ticker: ${datasetKey}`,
          ResearchDatasetRegistryErrorCode.DUPLICATE_MARKET_TICKER,
          marketTicker,
        );
      }

      seenKeys.set(datasetKey, marketTicker);
      const fixturePath = buildResearchFixturePath(
        normalizedFixturesRoot,
        seriesTicker,
        marketTicker,
      );
      const metadataPath = buildImportMetadataPath(
        metadataRoot,
        seriesTicker,
        marketTicker,
      );

      if (!io.fileExists(fixturePath)) {
        throw new ResearchDatasetRegistryError(
          `Missing ${FIXTURE_FILENAME} for ${marketTicker}`,
          ResearchDatasetRegistryErrorCode.MISSING_FIXTURE,
          marketTicker,
        );
      }

      scanned.push({
        seriesTicker,
        marketTicker,
        fixturePath,
        metadataPath,
        fixtureJson: io.readFile(fixturePath),
        ...(metadataPath && io.fileExists(metadataPath)
          ? { metadataJson: io.readFile(metadataPath) }
          : {}),
      });
    }
  }

  return scanned;
}

/** Scans fixtures and builds registries in one step. */
export function buildResearchDatasetRegistryFromDirectories(
  fixturesRoot: string,
  metadataRoot: string | null,
  io: ResearchDatasetRegistryIo,
  options: { generatedAt: string },
): readonly ResearchDatasetSeriesRegistry[] {
  const scanned = scanResearchFixtures(fixturesRoot, metadataRoot, io);
  return buildResearchDatasetRegistries({
    fixturesRoot,
    metadataRoot,
    generatedAt: options.generatedAt,
    scanned,
  });
}

export function buildResearchDatasetRegistryOutputPaths(
  outputRoot: string,
  registries: readonly ResearchDatasetSeriesRegistry[],
): readonly string[] {
  return registries.map((registry) =>
    buildSeriesRegistryOutputPath(outputRoot, registry.seriesTicker),
  );
}
