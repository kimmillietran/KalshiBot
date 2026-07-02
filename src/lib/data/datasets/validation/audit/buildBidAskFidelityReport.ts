import { posix } from "node:path";

import { historicalResearchCliInputSchema } from "@/lib/data/fixtures/researchFixtureSchema";
import { assertSafePathSegment } from "@/lib/data/research/registry/researchDatasetRegistryPaths";

import {
  buildBidAskFidelityWarnings,
  computeBidAskSpreadStatistics,
  isSuspiciousZeroSpreadDataset,
  mergeBidAskSpreadStatistics,
} from "./computeBidAskFidelityMetrics";
import {
  FIXTURE_FILENAME,
  IMPORT_METADATA_FILENAME,
  type BidAskFidelityAuditIo,
  type BidAskFidelityMarketResult,
  type BidAskFidelityReport,
  type BidAskFidelitySeriesSummary,
  type BuildBidAskFidelityReportInput,
  type ScannedBidAskAuditDataset,
} from "./bidAskFidelityTypes";

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/").replace(/\/+$/, "");
}

function compareMarketResults(
  left: BidAskFidelityMarketResult,
  right: BidAskFidelityMarketResult,
): number {
  const seriesCompare = left.seriesTicker.localeCompare(right.seriesTicker);
  if (seriesCompare !== 0) {
    return seriesCompare;
  }

  return left.marketTicker.localeCompare(right.marketTicker);
}

function buildMarketResult(
  dataset: ScannedBidAskAuditDataset,
  highZeroSpreadThresholdPercent?: number,
): BidAskFidelityMarketResult {
  const statistics = computeBidAskSpreadStatistics(dataset.bronzeRecords);
  const warnings = buildBidAskFidelityWarnings(statistics, {
    highZeroSpreadThresholdPercent,
  });

  return {
    seriesTicker: dataset.seriesTicker,
    marketTicker: dataset.marketTicker,
    sourcePath: dataset.sourcePath,
    statistics,
    warnings,
    suspiciousZeroSpread: isSuspiciousZeroSpreadDataset(statistics, warnings),
  };
}

function buildSeriesSummaries(
  markets: readonly BidAskFidelityMarketResult[],
  highZeroSpreadThresholdPercent?: number,
): BidAskFidelitySeriesSummary[] {
  const bySeries = new Map<string, BidAskFidelityMarketResult[]>();

  for (const market of markets) {
    const existing = bySeries.get(market.seriesTicker) ?? [];
    existing.push(market);
    bySeries.set(market.seriesTicker, existing);
  }

  return [...bySeries.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([seriesTicker, seriesMarkets]) => {
      const sortedMarkets = [...seriesMarkets].sort(compareMarketResults);
      const statistics = mergeBidAskSpreadStatistics(
        sortedMarkets.map((market) => market.statistics),
      );
      const warnings = buildBidAskFidelityWarnings(statistics, {
        highZeroSpreadThresholdPercent,
      });

      return {
        seriesTicker,
        marketCount: sortedMarkets.length,
        candleCount: statistics.candleCount,
        suspiciousZeroSpreadMarketCount: sortedMarkets.filter(
          (market) => market.suspiciousZeroSpread,
        ).length,
        markets: sortedMarkets,
        statistics,
        warnings,
      };
    });
}

/** Builds a deterministic bid/ask fidelity report from scanned datasets. */
export function buildBidAskFidelityReport(
  input: BuildBidAskFidelityReportInput,
): BidAskFidelityReport {
  const markets = [...input.datasets]
    .map((dataset) =>
      buildMarketResult(dataset, input.highZeroSpreadThresholdPercent),
    )
    .sort(compareMarketResults);

  const series = buildSeriesSummaries(
    markets,
    input.highZeroSpreadThresholdPercent,
  );
  const summaryStatistics = mergeBidAskSpreadStatistics(
    markets.map((market) => market.statistics),
  );
  const summaryWarnings = buildBidAskFidelityWarnings(summaryStatistics, {
    highZeroSpreadThresholdPercent: input.highZeroSpreadThresholdPercent,
  });

  return {
    generatedAt: input.generatedAt,
    inputDir: normalizePath(input.inputDir),
    outputPath: normalizePath(input.outputPath),
    series,
    summary: {
      seriesCount: series.length,
      marketCount: markets.length,
      candleCount: summaryStatistics.candleCount,
      suspiciousZeroSpreadMarketCount: markets.filter(
        (market) => market.suspiciousZeroSpread,
      ).length,
      statistics: summaryStatistics,
      warnings: summaryWarnings,
    },
  };
}

function parseFixtureBronzeRecords(
  json: string,
  sourcePath: string,
): ScannedBidAskAuditDataset["bronzeRecords"] {
  let parsed: unknown;

  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error(`${sourcePath} contains invalid JSON`);
  }

  const result = historicalResearchCliInputSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(`${sourcePath} failed fixture validation`);
  }

  return result.data.bronzeRecords;
}

function resolveFixturePathForMarketDir(
  inputDir: string,
  seriesTicker: string,
  marketTicker: string,
): string {
  const normalizedInput = normalizePath(inputDir);
  const coLocatedFixture = posix.join(
    normalizedInput,
    seriesTicker,
    marketTicker,
    FIXTURE_FILENAME,
  );

  if (normalizedInput.includes("/imports")) {
    return coLocatedFixture.replace("/imports/", "/fixtures/");
  }

  return coLocatedFixture;
}

function scanMarketDirectory(
  inputDir: string,
  seriesTicker: string,
  marketTicker: string,
  io: BidAskFidelityAuditIo,
): ScannedBidAskAuditDataset | null {
  assertSafePathSegment(seriesTicker, "seriesTicker", marketTicker);
  assertSafePathSegment(marketTicker, "marketTicker", marketTicker);

  const marketDir = posix.join(inputDir, seriesTicker, marketTicker);
  const coLocatedFixture = posix.join(marketDir, FIXTURE_FILENAME);
  const pairedFixture = resolveFixturePathForMarketDir(
    inputDir,
    seriesTicker,
    marketTicker,
  );

  const fixturePath = io.fileExists(coLocatedFixture)
    ? coLocatedFixture
    : io.fileExists(pairedFixture)
      ? pairedFixture
      : null;

  if (!fixturePath) {
    return null;
  }

  return {
    seriesTicker,
    marketTicker,
    sourcePath: fixturePath,
    bronzeRecords: parseFixtureBronzeRecords(io.readFile(fixturePath), fixturePath),
  };
}

function scanSeriesDirectory(
  inputDir: string,
  seriesTicker: string,
  io: BidAskFidelityAuditIo,
): ScannedBidAskAuditDataset[] {
  const seriesDir = posix.join(inputDir, seriesTicker);
  if (!io.isDirectory(seriesDir)) {
    return [];
  }

  const datasets: ScannedBidAskAuditDataset[] = [];

  for (const entry of [...io.readdir(seriesDir)].sort((left, right) =>
    left.localeCompare(right),
  )) {
    const marketDir = posix.join(seriesDir, entry);
    if (!io.isDirectory(marketDir)) {
      continue;
    }

    const dataset = scanMarketDirectory(inputDir, seriesTicker, entry, io);
    if (dataset) {
      datasets.push(dataset);
    }
  }

  return datasets;
}

function scanFixtureFiles(inputDir: string, io: BidAskFidelityAuditIo): ScannedBidAskAuditDataset[] {
  const datasets: ScannedBidAskAuditDataset[] = [];

  for (const seriesTicker of [...io.readdir(inputDir)].sort((left, right) =>
    left.localeCompare(right),
  )) {
    const seriesDir = posix.join(inputDir, seriesTicker);
    if (!io.isDirectory(seriesDir)) {
      continue;
    }

    for (const marketTicker of [...io.readdir(seriesDir)].sort((left, right) =>
      left.localeCompare(right),
    )) {
      const fixturePath = posix.join(seriesDir, marketTicker, FIXTURE_FILENAME);
      if (!io.fileExists(fixturePath)) {
        continue;
      }

      datasets.push({
        seriesTicker,
        marketTicker,
        sourcePath: fixturePath,
        bronzeRecords: parseFixtureBronzeRecords(
          io.readFile(fixturePath),
          fixturePath,
        ),
      });
    }
  }

  return datasets;
}

/** Scans an imports or fixtures root for replay datasets to audit. */
export function scanBidAskAuditDatasets(
  inputDir: string,
  io: BidAskFidelityAuditIo,
): ScannedBidAskAuditDataset[] {
  const normalizedInputDir = normalizePath(inputDir);
  if (!io.isDirectory(normalizedInputDir)) {
    return [];
  }

  const datasets: ScannedBidAskAuditDataset[] = [];
  const seen = new Set<string>();

  for (const seriesTicker of [...io.readdir(normalizedInputDir)].sort((left, right) =>
    left.localeCompare(right),
  )) {
    const seriesDir = posix.join(normalizedInputDir, seriesTicker);
    if (!io.isDirectory(seriesDir)) {
      continue;
    }

    for (const dataset of scanSeriesDirectory(normalizedInputDir, seriesTicker, io)) {
      const key = `${dataset.seriesTicker}/${dataset.marketTicker}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      datasets.push(dataset);
    }
  }

  if (datasets.length === 0) {
    for (const dataset of scanFixtureFiles(normalizedInputDir, io)) {
      const key = `${dataset.seriesTicker}/${dataset.marketTicker}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      datasets.push(dataset);
    }
  }

  return datasets.sort((left, right) => {
    const seriesCompare = left.seriesTicker.localeCompare(right.seriesTicker);
    if (seriesCompare !== 0) {
      return seriesCompare;
    }

    return left.marketTicker.localeCompare(right.marketTicker);
  });
}

export { IMPORT_METADATA_FILENAME };
