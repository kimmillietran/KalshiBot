import { stableStringify } from "@/lib/trading/config/hashConfig";

import { normalizeRootPath } from "../aggregation/researchAggregatePaths";
import { scanCalibrationResearchOutputs } from "@/lib/data/research/calibration/scanCalibrationResearchOutputs";

import { computeRegimeMarketEntry } from "./computeRegimeMarketEntry";
import { extractRegimeStepsFromResearchOutput } from "./parseRegimeSteps";
import { createEmptySummaryCounts } from "./regimeTaggingBuckets";
import type {
  BuildRegimeTagsReportInput,
  RegimeMarketEntry,
  RegimeSummaryCounts,
  RegimeTaggingIo,
  RegimeTaggingWarning,
  RegimeTagsReport,
} from "./regimeTaggingTypes";

function sortWarnings(warnings: readonly RegimeTaggingWarning[]): RegimeTaggingWarning[] {
  return [...warnings].sort((left, right) => {
    const marketCompare = (left.marketTicker ?? "").localeCompare(
      right.marketTicker ?? "",
    );
    if (marketCompare !== 0) {
      return marketCompare;
    }

    return left.message.localeCompare(right.message);
  });
}

function sortMarkets(markets: readonly RegimeMarketEntry[]): RegimeMarketEntry[] {
  return [...markets].sort((left, right) => {
    const strategyCompare = left.strategyId.localeCompare(right.strategyId);
    if (strategyCompare !== 0) {
      return strategyCompare;
    }

    const seriesCompare = left.seriesTicker.localeCompare(right.seriesTicker);
    if (seriesCompare !== 0) {
      return seriesCompare;
    }

    return left.marketTicker.localeCompare(right.marketTicker);
  });
}

function incrementSummaryCounts(
  summaryCounts: RegimeSummaryCounts,
  market: RegimeMarketEntry,
): void {
  if (market.tags.volatility) {
    summaryCounts.volatility[market.tags.volatility] += 1;
  }

  if (market.tags.trend) {
    summaryCounts.trend[market.tags.trend] += 1;
  }

  if (market.tags.marketState) {
    summaryCounts.marketState[market.tags.marketState] += 1;
  }
}

function buildEmptyReport(input: {
  inputRoot: string;
  outputPath: string;
  generatedAt: string;
  warnings: readonly RegimeTaggingWarning[];
}): RegimeTagsReport {
  return {
    generatedAt: input.generatedAt,
    inputRoot: normalizeRootPath(input.inputRoot),
    outputPath: normalizeRootPath(input.outputPath),
    sampleCounts: {
      marketCount: 0,
      taggedMarketCount: 0,
      skippedMarkets: 0,
      totalSteps: 0,
    },
    summaryCounts: createEmptySummaryCounts(),
    markets: [],
    warnings: sortWarnings(input.warnings),
  };
}

/** Builds a deterministic regime tags report from scanned research outputs. */
export function buildRegimeTagsReport(input: BuildRegimeTagsReportInput): RegimeTagsReport {
  const warnings: RegimeTaggingWarning[] = [];

  if (input.scanned.length === 0) {
    warnings.push({
      code: "empty-dataset",
      message: "No research outputs found for regime tagging",
    });

    return buildEmptyReport({
      inputRoot: input.inputRoot,
      outputPath: input.outputPath,
      generatedAt: input.generatedAt,
      warnings,
    });
  }

  const markets: RegimeMarketEntry[] = [];
  let skippedMarkets = 0;
  let totalSteps = 0;

  for (const entry of [...input.scanned].sort((left, right) =>
    left.marketTicker.localeCompare(right.marketTicker),
  )) {
    const extracted = extractRegimeStepsFromResearchOutput(
      entry.outputJson,
      entry.outputPath,
      {
        strategyId: entry.strategyId,
        seriesTicker: entry.seriesTicker,
        marketTicker: entry.marketTicker,
      },
    );

    warnings.push(...extracted.warnings);

    if (extracted.steps.length === 0) {
      skippedMarkets += 1;
      continue;
    }

    const marketEntry = computeRegimeMarketEntry({
      strategyId: extracted.strategyId,
      seriesTicker: extracted.seriesTicker,
      marketTicker: extracted.marketTicker,
      outputPath: entry.outputPath,
      steps: extracted.steps,
    });

    markets.push(marketEntry);
    totalSteps += marketEntry.metrics.stepCount;
  }

  const sortedMarkets = sortMarkets(markets);
  const summaryCounts = createEmptySummaryCounts();

  for (const market of sortedMarkets) {
    incrementSummaryCounts(summaryCounts, market);
  }

  return {
    generatedAt: input.generatedAt,
    inputRoot: normalizeRootPath(input.inputRoot),
    outputPath: normalizeRootPath(input.outputPath),
    sampleCounts: {
      marketCount: sortedMarkets.length,
      taggedMarketCount: sortedMarkets.filter(
        (market) =>
          market.tags.volatility !== null
          || market.tags.trend !== null
          || market.tags.marketState !== null,
      ).length,
      skippedMarkets,
      totalSteps,
    },
    summaryCounts,
    markets: sortedMarkets,
    warnings: sortWarnings(warnings),
  };
}

export function buildRegimeTagsReportFromDirectories(
  inputRoot: string,
  outputPath: string,
  io: RegimeTaggingIo,
  options: { generatedAt: string },
): RegimeTagsReport {
  const scanned = scanCalibrationResearchOutputs(inputRoot, io);

  return buildRegimeTagsReport({
    inputRoot,
    outputPath,
    generatedAt: options.generatedAt,
    scanned,
  });
}

export function serializeRegimeTagsReport(report: RegimeTagsReport): string {
  return stableStringify(report);
}
