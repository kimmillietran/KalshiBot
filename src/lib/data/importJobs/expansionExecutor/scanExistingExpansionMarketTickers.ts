import { posix } from "node:path";

import { BATCH_IMPORT_CONFIG_FILENAME } from "@/lib/data/importJobs/batchImport/batchImportTypes";
import { RESEARCH_OUTPUT_FILENAME } from "@/lib/data/research/aggregation/researchAggregatePaths";

import type { ExpansionExecutorIo } from "./expansionExecutorTypes";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function walkFiles(
  rootDir: string,
  targetFilename: string,
  io: ExpansionExecutorIo,
): string[] {
  if (!io.fileExists(rootDir) || !io.isDirectory(rootDir)) {
    return [];
  }

  const paths: string[] = [];

  function walk(currentDir: string): void {
    for (const entry of io.readdir(currentDir)) {
      const fullPath = posix.join(currentDir, entry);
      if (io.isDirectory(fullPath)) {
        walk(fullPath);
        continue;
      }

      if (entry === targetFilename) {
        paths.push(fullPath);
      }
    }
  }

  walk(rootDir);
  return paths;
}

function readMarketTickerFromJson(path: string, io: ExpansionExecutorIo): string | null {
  try {
    const parsed = JSON.parse(io.readFile(path)) as unknown;
    if (!isRecord(parsed)) {
      return null;
    }

    return typeof parsed.marketTicker === "string" ? parsed.marketTicker : null;
  } catch {
    return null;
  }
}

/** Collects market tickers already present in import configs, fixtures, or research outputs. */
export function scanExistingExpansionMarketTickers(
  paths: {
    importConfigsDir: string;
    fixturesDir: string;
    researchResultsDir: string;
  },
  io: ExpansionExecutorIo,
): Set<string> {
  const tickers = new Set<string>();

  for (const configPath of walkFiles(
    paths.importConfigsDir,
    BATCH_IMPORT_CONFIG_FILENAME,
    io,
  )) {
    const marketTicker = readMarketTickerFromJson(configPath, io);
    if (marketTicker) {
      tickers.add(marketTicker);
    }
  }

  function walkFixtureJson(rootDir: string): void {
    if (!io.fileExists(rootDir) || !io.isDirectory(rootDir)) {
      return;
    }

    for (const entry of io.readdir(rootDir)) {
      const fullPath = posix.join(rootDir, entry);
      if (io.isDirectory(fullPath)) {
        walkFixtureJson(fullPath);
        continue;
      }

      if (entry.endsWith(".json")) {
        const marketTicker = readMarketTickerFromJson(fullPath, io);
        if (marketTicker) {
          tickers.add(marketTicker);
        }
      }
    }
  }

  walkFixtureJson(paths.fixturesDir);

  for (const outputPath of walkFiles(
    paths.researchResultsDir,
    RESEARCH_OUTPUT_FILENAME,
    io,
  )) {
    const marketTicker = readMarketTickerFromJson(outputPath, io);
    if (marketTicker) {
      tickers.add(marketTicker);
    }
  }

  return tickers;
}
