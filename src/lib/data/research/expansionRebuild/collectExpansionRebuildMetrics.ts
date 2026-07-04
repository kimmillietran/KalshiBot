import { posix } from "node:path";

import { BATCH_FIXTURE_OUTPUT_FILENAME } from "@/lib/data/importJobs/batchFixtureBridge/batchFixtureBridgeTypes";
import {
  BATCH_RESEARCH_OUTPUT_FILENAME,
  DATASET_REGISTRY_FILENAME,
} from "@/lib/data/research/batchResearch/batchResearchTypes";
import { computeCoverageSnapshot } from "@/lib/data/research/coveragePlanner/computeCoverageSnapshot";
import { scanCoverageMarketRecords } from "@/lib/data/research/coveragePlanner/scanCoverageMarketRecords";

import type { ExpansionRebuildIo, ExpansionRebuildMetrics } from "./expansionRebuildTypes";

function countFilesNamed(
  root: string,
  filename: string,
  io: ExpansionRebuildIo,
): number {
  if (!io.fileExists(root) || !io.isDirectory(root)) {
    return 0;
  }

  let count = 0;

  function walk(directoryPath: string): void {
    for (const entry of [...io.readdir(directoryPath)].sort()) {
      const entryPath = posix.join(directoryPath, entry);
      if (entry === filename && io.fileExists(entryPath)) {
        count += 1;
        continue;
      }

      if (io.isDirectory(entryPath)) {
        walk(entryPath);
      }
    }
  }

  walk(root);
  return count;
}

function readRegistryMarketCount(registryDir: string, io: ExpansionRebuildIo): number {
  if (!io.fileExists(registryDir) || !io.isDirectory(registryDir)) {
    return 0;
  }

  let total = 0;

  for (const seriesEntry of [...io.readdir(registryDir)].sort()) {
    const registryPath = posix.join(registryDir, seriesEntry, DATASET_REGISTRY_FILENAME);
    if (!io.fileExists(registryPath)) {
      continue;
    }

    try {
      const parsed = JSON.parse(io.readFile(registryPath)) as { markets?: unknown[] };
      if (Array.isArray(parsed.markets)) {
        total += parsed.markets.length;
      }
    } catch {
      continue;
    }
  }

  return total;
}

function readAtlasMarketCount(atlasPath: string, io: ExpansionRebuildIo): number | null {
  if (!io.fileExists(atlasPath)) {
    return null;
  }

  try {
    const parsed = JSON.parse(io.readFile(atlasPath)) as {
      sampleCounts?: { marketCount?: unknown };
    };
    const marketCount = parsed.sampleCounts?.marketCount;
    return typeof marketCount === "number" && Number.isFinite(marketCount)
      ? marketCount
      : null;
  } catch {
    return null;
  }
}

/** Collects before/after rebuild coverage metrics. */
export function collectExpansionRebuildMetrics(
  io: ExpansionRebuildIo,
  paths: {
    importConfigsDir: string;
    fixturesDir: string;
    researchResultsDir: string;
    registryDir: string;
    mispricingAtlasPath: string;
  },
): ExpansionRebuildMetrics {
  const scanResult = scanCoverageMarketRecords(io, {
    importConfigsDir: paths.importConfigsDir,
    fixturesDir: paths.fixturesDir,
    researchResultsDir: paths.researchResultsDir,
  });
  const snapshot = computeCoverageSnapshot(scanResult.records, {
    importConfigCount: scanResult.importConfigCount,
    fixtureCount: scanResult.fixtureCount,
    researchOutputCount: scanResult.researchOutputCount,
  });

  return {
    fixtureCount: countFilesNamed(paths.fixturesDir, BATCH_FIXTURE_OUTPUT_FILENAME, io),
    researchOutputCount: countFilesNamed(
      paths.researchResultsDir,
      BATCH_RESEARCH_OUTPUT_FILENAME,
      io,
    ),
    registryMarketCount: readRegistryMarketCount(paths.registryDir, io),
    uniqueTradingDays: snapshot.uniqueTradingDays,
    atlasMarketCount: readAtlasMarketCount(paths.mispricingAtlasPath, io),
  };
}
