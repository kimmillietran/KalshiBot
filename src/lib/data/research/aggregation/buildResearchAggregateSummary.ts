import { posix } from "node:path";

import { stableStringify } from "@/lib/trading/config/hashConfig";

import {
  computeDurationStatistics,
  computeMarketCounts,
  computePerformanceStatistics,
  toMarketResultSummary,
} from "./computeResearchAggregateStatistics";
import { parseResearchOutputJson } from "./parseResearchOutputJson";
import {
  assertSafePathSegment,
  buildMarketResultKey,
  buildSeriesAggregateOutputPath,
  compareMarketSummaries,
  normalizeRootPath,
  RESEARCH_OUTPUT_FILENAME,
} from "./researchAggregatePaths";
import {
  ResearchAggregateError,
  ResearchAggregateErrorCode,
  type BuildResearchAggregateSummaryInput,
  type ResearchAggregateIo,
  type ResearchMarketResultSummary,
  type ResearchSeriesAggregateSummary,
  type ScannedResearchOutput,
} from "./researchAggregateTypes";

function buildMarketSummaries(
  scanned: readonly ScannedResearchOutput[],
): ResearchMarketResultSummary[] {
  return scanned.map((entry) => {
    if (!entry.outputJson) {
      throw new ResearchAggregateError(
        `Missing ${RESEARCH_OUTPUT_FILENAME} for ${entry.marketTicker}`,
        ResearchAggregateErrorCode.MISSING_RESEARCH_OUTPUT,
        entry.marketTicker,
      );
    }

    const parsed = parseResearchOutputJson(entry.outputJson, entry.marketTicker);
    if (parsed.marketTicker !== entry.marketTicker) {
      throw new ResearchAggregateError(
        "research-output.json marketTicker does not match directory name",
        ResearchAggregateErrorCode.AGGREGATE_INCONSISTENCY,
        entry.marketTicker,
      );
    }

    return toMarketResultSummary(entry.outputPath, parsed);
  });
}

function validateSummaryConsistency(
  summary: ResearchSeriesAggregateSummary,
): void {
  if (summary.marketCounts.total !== summary.markets.length) {
    throw new ResearchAggregateError(
      "Aggregate marketCounts.total is inconsistent",
      ResearchAggregateErrorCode.AGGREGATE_INCONSISTENCY,
    );
  }

  if (
    summary.marketCounts.completed + summary.marketCounts.failed
    !== summary.marketCounts.total
  ) {
    throw new ResearchAggregateError(
      "Aggregate completed/failed counts are inconsistent",
      ResearchAggregateErrorCode.AGGREGATE_INCONSISTENCY,
    );
  }
}

/** Builds a deterministic series-level aggregate summary from scanned outputs. */
export function buildResearchAggregateSummary(
  input: BuildResearchAggregateSummaryInput,
): ResearchSeriesAggregateSummary {
  const sorted = [...input.scanned].sort((left, right) => {
    const seriesCompare = left.seriesTicker.localeCompare(right.seriesTicker);
    if (seriesCompare !== 0) {
      return seriesCompare;
    }

    return left.marketTicker.localeCompare(right.marketTicker);
  });

  const seenKeys = new Set<string>();
  for (const entry of sorted) {
    const key = buildMarketResultKey(entry.seriesTicker, entry.marketTicker);
    if (seenKeys.has(key)) {
      throw new ResearchAggregateError(
        `Duplicate market result: ${key}`,
        ResearchAggregateErrorCode.DUPLICATE_MARKET_RESULT,
        entry.marketTicker,
      );
    }
    seenKeys.add(key);
  }

  if (sorted.length === 0) {
    throw new ResearchAggregateError(
      "No research outputs were discovered",
      ResearchAggregateErrorCode.EMPTY_DATASET,
    );
  }

  const markets = buildMarketSummaries(sorted).sort(compareMarketSummaries);
  const marketCounts = computeMarketCounts(markets);
  const summary: ResearchSeriesAggregateSummary = {
    generatedAt: input.generatedAt,
    seriesTicker: input.seriesTicker,
    inputRoot: normalizeRootPath(input.inputRoot),
    marketCounts,
    performance: computePerformanceStatistics(markets),
    duration: computeDurationStatistics(markets),
    markets,
  };

  validateSummaryConsistency(summary);
  return summary;
}

/** Builds aggregate summaries grouped by series ticker. */
export function buildResearchAggregateSummaries(
  inputRoot: string,
  scanned: readonly ScannedResearchOutput[],
  options: { generatedAt: string },
): readonly ResearchSeriesAggregateSummary[] {
  const bySeries = new Map<string, ScannedResearchOutput[]>();

  for (const entry of scanned) {
    const seriesEntries = bySeries.get(entry.seriesTicker) ?? [];
    seriesEntries.push(entry);
    bySeries.set(entry.seriesTicker, seriesEntries);
  }

  return [...bySeries.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([seriesTicker, seriesScanned]) =>
      buildResearchAggregateSummary({
        inputRoot,
        seriesTicker,
        generatedAt: options.generatedAt,
        scanned: seriesScanned,
      }),
    );
}

function collectResearchOutputsInDirectory(
  directoryPath: string,
  seriesTicker: string,
  io: ResearchAggregateIo,
  collected: ScannedResearchOutput[],
  seenKeys: Map<string, string>,
): void {
  if (!io.isDirectory(directoryPath)) {
    return;
  }

  for (const entryName of [...io.readdir(directoryPath)].sort()) {
    const entryPath = posix.join(directoryPath, entryName);

    if (io.isDirectory(entryPath)) {
      collectResearchOutputsInDirectory(
        entryPath,
        seriesTicker,
        io,
        collected,
        seenKeys,
      );
      continue;
    }

    if (entryName !== RESEARCH_OUTPUT_FILENAME) {
      continue;
    }

    const marketTicker = assertSafePathSegment(
      posix.basename(posix.dirname(entryPath)),
      "marketTicker",
    );
    const key = buildMarketResultKey(seriesTicker, marketTicker);
    if (seenKeys.has(key)) {
      throw new ResearchAggregateError(
        `Duplicate market result: ${key}`,
        ResearchAggregateErrorCode.DUPLICATE_MARKET_RESULT,
        marketTicker,
      );
    }

    seenKeys.set(key, entryPath);
    collected.push({
      seriesTicker,
      marketTicker,
      outputPath: entryPath,
      outputJson: io.readFile(entryPath),
    });
  }
}

/** Scans research result trees for research-output.json files. */
export function scanResearchOutputs(
  inputRoot: string,
  io: ResearchAggregateIo,
): ScannedResearchOutput[] {
  const normalizedInputRoot = normalizeRootPath(inputRoot);

  if (!io.isDirectory(normalizedInputRoot)) {
    throw new ResearchAggregateError(
      `Research results directory does not exist: ${normalizedInputRoot}`,
      ResearchAggregateErrorCode.MISSING_INPUT_DIRECTORY,
    );
  }

  const collected: ScannedResearchOutput[] = [];
  const seenKeys = new Map<string, string>();

  for (const seriesTickerRaw of [...io.readdir(normalizedInputRoot)].sort()) {
    const seriesTicker = assertSafePathSegment(seriesTickerRaw, "seriesTicker");
    const seriesPath = posix.join(normalizedInputRoot, seriesTicker);

    if (!io.isDirectory(seriesPath)) {
      continue;
    }

    collectResearchOutputsInDirectory(
      seriesPath,
      seriesTicker,
      io,
      collected,
      seenKeys,
    );
  }

  return collected;
}

/** Scans research outputs and builds aggregate summaries in one step. */
export function buildResearchAggregateSummariesFromDirectories(
  inputRoot: string,
  io: ResearchAggregateIo,
  options: { generatedAt: string },
): readonly ResearchSeriesAggregateSummary[] {
  const scanned = scanResearchOutputs(inputRoot, io);
  return buildResearchAggregateSummaries(inputRoot, scanned, options);
}

export function buildResearchAggregateOutputPaths(
  outputRoot: string,
  summaries: readonly ResearchSeriesAggregateSummary[],
): readonly string[] {
  return summaries.map((summary) =>
    buildSeriesAggregateOutputPath(outputRoot, summary.seriesTicker),
  );
}

/** Serializes an aggregate summary to stable JSON. */
export function serializeResearchAggregateSummary(
  summary: ResearchSeriesAggregateSummary,
): string {
  return stableStringify(summary);
}
