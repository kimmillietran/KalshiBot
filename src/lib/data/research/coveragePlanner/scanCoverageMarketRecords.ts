import { BATCH_IMPORT_CONFIG_FILENAME } from "@/lib/data/importJobs/batchImport/batchImportTypes";
import { RESEARCH_OUTPUT_FILENAME } from "@/lib/data/research/aggregation/researchAggregatePaths";

import {
  calendarMonthsBetween,
  toCalendarMonthUtc,
  toTradingDayUtc,
  tradingDaysBetween,
} from "./coveragePlannerDateUtils";
import type {
  CoverageMarketRecord,
  CoveragePlannerIo,
} from "./coveragePlannerTypes";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseSeriesFromImportConfigPath(configPath: string): string {
  const segments = configPath.replace(/\\/g, "/").split("/");
  const configsIndex = segments.lastIndexOf("import-configs");
  if (configsIndex >= 0 && segments[configsIndex + 1]) {
    return segments[configsIndex + 1];
  }

  const parent = segments.at(-2);
  return parent ?? "UNKNOWN";
}

function walkImportConfigPaths(rootDir: string, io: CoveragePlannerIo): string[] {
  if (!io.fileExists(rootDir) || !io.isDirectory(rootDir)) {
    return [];
  }

  const paths: string[] = [];

  function walk(currentDir: string): void {
    for (const entry of io.readdir(currentDir)) {
      const fullPath = `${currentDir}/${entry}`.replace(/\\/g, "/");
      if (io.isDirectory(fullPath)) {
        walk(fullPath);
        continue;
      }

      if (entry === BATCH_IMPORT_CONFIG_FILENAME) {
        paths.push(fullPath);
      }
    }
  }

  walk(rootDir);
  return paths;
}

function countFixtureMarkets(fixturesDir: string, io: CoveragePlannerIo): number {
  if (!io.fileExists(fixturesDir) || !io.isDirectory(fixturesDir)) {
    return 0;
  }

  let count = 0;

  function walk(currentDir: string): void {
    for (const entry of io.readdir(currentDir)) {
      const fullPath = `${currentDir}/${entry}`;
      if (io.isDirectory(fullPath)) {
        walk(fullPath);
        continue;
      }

      if (entry.endsWith(".json")) {
        count += 1;
      }
    }
  }

  walk(fixturesDir);
  return count;
}

function parseImportConfigRecord(
  configPath: string,
  io: CoveragePlannerIo,
): CoverageMarketRecord | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(io.readFile(configPath));
  } catch {
    return null;
  }

  if (!isRecord(parsed)) {
    return null;
  }

  const marketTicker =
    typeof parsed.marketTicker === "string" ? parsed.marketTicker : null;
  const startTime = typeof parsed.startTime === "string" ? parsed.startTime : null;
  const endTime = typeof parsed.endTime === "string" ? parsed.endTime : null;

  if (!marketTicker || !startTime || !endTime) {
    return null;
  }

  return {
    seriesTicker: parseSeriesFromImportConfigPath(configPath),
    marketTicker,
    source: "import-config",
    calendarMonths: calendarMonthsBetween(startTime, endTime),
    tradingDays: tradingDaysBetween(startTime, endTime),
    volatilityRegime: null,
  };
}

function walkResearchOutputPaths(rootDir: string, io: CoveragePlannerIo): string[] {
  if (!io.fileExists(rootDir) || !io.isDirectory(rootDir)) {
    return [];
  }

  const paths: string[] = [];

  function walk(currentDir: string): void {
    for (const entry of io.readdir(currentDir)) {
      const fullPath = `${currentDir}/${entry}`.replace(/\\/g, "/");
      if (io.isDirectory(fullPath)) {
        walk(fullPath);
        continue;
      }

      if (entry === RESEARCH_OUTPUT_FILENAME) {
        paths.push(fullPath);
      }
    }
  }

  walk(rootDir);
  return paths;
}

function parseSeriesFromResearchOutputPath(outputPath: string): string {
  const segments = outputPath.replace(/\\/g, "/").split("/");
  const outputIndex = segments.lastIndexOf(RESEARCH_OUTPUT_FILENAME);
  if (outputIndex >= 2) {
    return segments[outputIndex - 2] ?? "UNKNOWN";
  }

  return "UNKNOWN";
}

function parseResearchOutputRecord(
  outputPath: string,
  io: CoveragePlannerIo,
): CoverageMarketRecord | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(io.readFile(outputPath));
  } catch {
    return null;
  }

  if (!isRecord(parsed)) {
    return null;
  }

  const marketTicker =
    typeof parsed.marketTicker === "string" ? parsed.marketTicker : null;
  const seriesTicker =
    typeof parsed.seriesTicker === "string"
      ? parsed.seriesTicker
      : parseSeriesFromResearchOutputPath(outputPath);

  const closeTime =
    typeof parsed.closeTime === "string"
      ? parsed.closeTime
      : typeof parsed.marketCloseTime === "string"
        ? parsed.marketCloseTime
        : null;

  const months: string[] = [];
  const days: string[] = [];

  if (closeTime) {
    const closeMs = Date.parse(closeTime);
    if (Number.isFinite(closeMs)) {
      months.push(toCalendarMonthUtc(closeMs));
      days.push(toTradingDayUtc(closeMs));
    }
  }

  if (!marketTicker) {
    return null;
  }

  return {
    seriesTicker,
    marketTicker,
    source: "research-output",
    calendarMonths: months,
    tradingDays: days,
    volatilityRegime: null,
  };
}

function attachVolatilityRegimes(
  records: CoverageMarketRecord[],
  regimeByMarket: ReadonlyMap<string, "low" | "medium" | "high">,
): CoverageMarketRecord[] {
  return records.map((record) => ({
    ...record,
    volatilityRegime: regimeByMarket.get(record.marketTicker) ?? null,
  }));
}

export type ScanCoverageMarketRecordsResult = {
  records: readonly CoverageMarketRecord[];
  importConfigCount: number;
  fixtureCount: number;
  researchOutputCount: number;
};

/** Scans import configs, fixtures, and research outputs for coverage signals. */
export function scanCoverageMarketRecords(
  io: CoveragePlannerIo,
  paths: {
    importConfigsDir: string;
    fixturesDir: string;
    researchResultsDir: string;
  },
  regimeByMarket: ReadonlyMap<string, "low" | "medium" | "high"> = new Map(),
): ScanCoverageMarketRecordsResult {
  const importConfigPaths = walkImportConfigPaths(paths.importConfigsDir, io);
  const importRecords = importConfigPaths
    .map((configPath) => parseImportConfigRecord(configPath, io))
    .filter((record): record is CoverageMarketRecord => record !== null);

  const researchOutputPaths = walkResearchOutputPaths(paths.researchResultsDir, io);
  const researchRecords = researchOutputPaths
    .map((outputPath) => parseResearchOutputRecord(outputPath, io))
    .filter((record): record is CoverageMarketRecord => record !== null);

  const records = attachVolatilityRegimes(
    [...researchRecords, ...importRecords],
    regimeByMarket,
  );

  return {
    records,
    importConfigCount: importRecords.length,
    fixtureCount: countFixtureMarkets(paths.fixturesDir, io),
    researchOutputCount: researchRecords.length,
  };
}
