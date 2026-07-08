import type { ResearchDatasetSeriesRegistry } from "@/lib/data/research/registry/researchDatasetRegistryTypes";

import type {
  MarketUniverseSummary,
  QuoteFidelityGateConfig,
  RegistryMarketRecord,
} from "./quoteFidelityGateTypes";

function toCalendarMonth(isoTimestamp: string | null): string | null {
  if (!isoTimestamp) {
    return null;
  }

  const date = new Date(isoTimestamp);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function toTradingDay(isoTimestamp: string | null): string | null {
  if (!isoTimestamp) {
    return null;
  }

  const date = new Date(isoTimestamp);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString().slice(0, 10);
}

export function buildMarketUniverseSummary(input: {
  config: QuoteFidelityGateConfig;
  markets: readonly RegistryMarketRecord[];
  registryMarketCount: number;
  researchOutputMarketCount: number | null;
  fixtureMarketCount: number | null;
}): MarketUniverseSummary {
  const months = new Set<string>();
  const tradingDays = new Set<string>();
  let earliest: string | null = null;
  let latest: string | null = null;

  for (const market of input.markets) {
    const month = toCalendarMonth(market.marketCloseTime);
    if (month) {
      months.add(month);
    }

    const day = toTradingDay(market.marketCloseTime);
    if (day) {
      tradingDays.add(day);
    }

    if (market.marketCloseTime) {
      if (!earliest || market.marketCloseTime < earliest) {
        earliest = market.marketCloseTime;
      }
      if (!latest || market.marketCloseTime > latest) {
        latest = market.marketCloseTime;
      }
    }
  }

  const sortedMarkets = [...input.markets].sort((left, right) =>
    left.marketTicker.localeCompare(right.marketTicker),
  );

  return {
    seriesTicker: input.config.seriesTicker,
    marketCount: input.markets.length,
    registryMarketCount: input.registryMarketCount,
    researchOutputMarketCount: input.researchOutputMarketCount,
    fixtureMarketCount: input.fixtureMarketCount,
    monthsCovered: [...months].sort(),
    tradingDaysCovered: tradingDays.size,
    earliestMarket: sortedMarkets[0]?.marketTicker ?? null,
    latestMarket: sortedMarkets[sortedMarkets.length - 1]?.marketTicker ?? null,
    canonicalMarketCountSource: "dataset-registry.json",
    marketCountNotes:
      input.researchOutputMarketCount !== null
      && input.researchOutputMarketCount !== input.registryMarketCount
        ? `Registry is canonical for this gate. Research-output scan found ${input.researchOutputMarketCount} markets vs registry ${input.registryMarketCount}.`
        : "Dataset registry is the canonical market universe for quote fidelity and ladder feasibility.",
  };
}

export function countResearchOutputMarkets(
  researchResultsDir: string,
  seriesTicker: string,
  io: {
    fileExists: (path: string) => boolean;
    readdir: (path: string) => readonly string[];
    isDirectory: (path: string) => boolean;
  },
): number | null {
  const seriesDir = `${researchResultsDir}/${seriesTicker}`;
  if (!io.fileExists(seriesDir) || !io.isDirectory(seriesDir)) {
    return null;
  }

  let count = 0;
  for (const strategyId of io.readdir(seriesDir)) {
    const strategyPath = `${seriesDir}/${strategyId}`;
    if (!io.isDirectory(strategyPath)) {
      continue;
    }

    for (const seriesEntry of io.readdir(strategyPath)) {
      const seriesPath = `${strategyPath}/${seriesEntry}`;
      if (!io.isDirectory(seriesPath)) {
        continue;
      }

      for (const marketTicker of io.readdir(seriesPath)) {
        const outputPath = `${seriesPath}/${marketTicker}/research-output.json`;
        if (io.fileExists(outputPath)) {
          count += 1;
        }
      }
    }
  }

  return count;
}

export function parseDatasetRegistry(
  registryJson: string,
): ResearchDatasetSeriesRegistry {
  const parsed = JSON.parse(registryJson) as ResearchDatasetSeriesRegistry;
  if (!parsed || !Array.isArray(parsed.markets)) {
    throw new Error("Invalid dataset registry document");
  }

  return parsed;
}
