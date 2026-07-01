import { posix } from "node:path";

import {
  computeDurationStatistics,
  computeMarketCounts,
  computePerformanceStatistics,
} from "../aggregation/computeResearchAggregateStatistics";
import {
  AGGREGATE_SUMMARY_FILENAME,
  assertSafePathSegment,
  buildMarketResultKey,
  compareMarketSummaries,
  normalizeRootPath,
} from "../aggregation/researchAggregatePaths";
import type { ResearchSeriesAggregateSummary } from "../aggregation/researchAggregateTypes";

import { parseAggregateSummaryJson } from "./parseAggregateSummaryJson";
import {
  StrategyLeaderboardError,
  StrategyLeaderboardErrorCode,
  type ParsedStrategyAggregateSummary,
  type ScannedStrategyAggregateSummary,
  type StrategyLeaderboardIo,
} from "./strategyLeaderboardTypes";

type MergeStrategyMarketsInput = {
  strategyId: string;
  summaries: readonly ResearchSeriesAggregateSummary[];
  sourcePaths: readonly string[];
};

/** Merges multi-series aggregate summaries for one strategy with duplicate detection. */
export function mergeStrategyMarkets(
  input: MergeStrategyMarketsInput,
): ParsedStrategyAggregateSummary {
  const seenKeys = new Set<string>();
  const mergedMarkets = [];

  const sortedSummaries = [...input.summaries].sort((left, right) =>
    left.seriesTicker.localeCompare(right.seriesTicker),
  );

  for (const summary of sortedSummaries) {
    for (const market of summary.markets) {
      const key = buildMarketResultKey(summary.seriesTicker, market.marketTicker);
      if (seenKeys.has(key)) {
        throw new StrategyLeaderboardError(
          `Duplicate market result: ${key}`,
          StrategyLeaderboardErrorCode.DUPLICATE_MARKET_RESULT,
          input.strategyId,
        );
      }

      seenKeys.add(key);
      mergedMarkets.push(market);
    }
  }

  mergedMarkets.sort(compareMarketSummaries);
  const marketCounts = computeMarketCounts(mergedMarkets);

  return {
    strategyId: input.strategyId,
    sourcePaths: [...input.sourcePaths].sort(),
    marketCounts,
    performance: computePerformanceStatistics(mergedMarkets),
    duration: computeDurationStatistics(mergedMarkets),
    markets: mergedMarkets,
  };
}

function collectAggregateSummariesInDirectory(
  directoryPath: string,
  strategyId: string,
  io: StrategyLeaderboardIo,
  collected: ScannedStrategyAggregateSummary[],
): void {
  if (!io.isDirectory(directoryPath)) {
    return;
  }

  const entries = [...io.readdir(directoryPath)].sort();
  for (const entry of entries) {
    const entryPath = posix.join(directoryPath, entry);
    if (entry === AGGREGATE_SUMMARY_FILENAME && io.fileExists(entryPath)) {
      collected.push({
        strategyId,
        summaryPath: entryPath,
        summaryJson: io.readFile(entryPath),
      });
      continue;
    }

    if (io.isDirectory(entryPath)) {
      collectAggregateSummariesInDirectory(entryPath, strategyId, io, collected);
    }
  }
}

function buildParsedSummary(
  strategyId: string,
  scanned: readonly ScannedStrategyAggregateSummary[],
): ParsedStrategyAggregateSummary {
  const summaries = scanned.map((entry) =>
    parseAggregateSummaryJson(entry.summaryJson, entry.summaryPath),
  );
  const sourcePaths = scanned.map((entry) => entry.summaryPath);

  return mergeStrategyMarkets({
    strategyId,
    summaries,
    sourcePaths,
  });
}

/** Discovers and merges aggregate summaries grouped by top-level strategy directories. */
export function discoverStrategyAggregateSummaries(
  inputRoot: string,
  io: StrategyLeaderboardIo,
): readonly ParsedStrategyAggregateSummary[] {
  const normalizedRoot = normalizeRootPath(inputRoot);

  if (!io.isDirectory(normalizedRoot)) {
    throw new StrategyLeaderboardError(
      `Research results directory does not exist: ${normalizedRoot}`,
      StrategyLeaderboardErrorCode.MISSING_INPUT_DIRECTORY,
    );
  }

  const strategyIds = [...io.readdir(normalizedRoot)]
    .map((entry) => assertSafePathSegment(entry, "strategyId"))
    .filter((entry) => io.isDirectory(posix.join(normalizedRoot, entry)))
    .sort();

  if (strategyIds.length === 0) {
    throw new StrategyLeaderboardError(
      "No strategy directories were found under the research results root",
      StrategyLeaderboardErrorCode.EMPTY_DATASET,
    );
  }

  const parsedSummaries: ParsedStrategyAggregateSummary[] = [];

  for (const strategyId of strategyIds) {
    const strategyDir = posix.join(normalizedRoot, strategyId);
    const scanned: ScannedStrategyAggregateSummary[] = [];
    collectAggregateSummariesInDirectory(strategyDir, strategyId, io, scanned);

    if (scanned.length === 0) {
      throw new StrategyLeaderboardError(
        `Missing aggregate summary for strategy: ${strategyId}`,
        StrategyLeaderboardErrorCode.MISSING_AGGREGATE_SUMMARY,
        strategyId,
      );
    }

    parsedSummaries.push(buildParsedSummary(strategyId, scanned));
  }

  const seenStrategyIds = new Set<string>();
  for (const summary of parsedSummaries) {
    if (seenStrategyIds.has(summary.strategyId)) {
      throw new StrategyLeaderboardError(
        `Duplicate strategy entry: ${summary.strategyId}`,
        StrategyLeaderboardErrorCode.DUPLICATE_STRATEGY,
        summary.strategyId,
      );
    }
    seenStrategyIds.add(summary.strategyId);
  }

  return parsedSummaries;
}
