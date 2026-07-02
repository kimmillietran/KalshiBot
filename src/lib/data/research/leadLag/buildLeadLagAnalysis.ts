import { stableStringify } from "@/lib/trading/config/hashConfig";

import { scanCalibrationResearchOutputs } from "@/lib/data/research/calibration/scanCalibrationResearchOutputs";

import {
  computeAggregateLeadLagMetrics,
  computeLeadLagMetricsForCandles,
  selectBestLag,
} from "./computeLeadLagMetrics";
import {
  DEFAULT_LEAD_LAG_MAX_LAG,
  type BuildLeadLagAnalysisInput,
  type LeadLagAnalysis,
  type LeadLagIo,
  type LeadLagMarketSeries,
  type LeadLagSampleCounts,
  type LeadLagWarning,
} from "./leadLagTypes";
import { extractLeadLagCandlesFromResearchOutput } from "./parseLeadLagSeries";

function sortWarnings(warnings: readonly LeadLagWarning[]): LeadLagWarning[] {
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

function sortMarkets(markets: readonly LeadLagMarketSeries[]): LeadLagMarketSeries[] {
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

function buildSampleCounts(input: {
  markets: readonly LeadLagMarketSeries[];
  warnings: readonly LeadLagWarning[];
}): LeadLagSampleCounts {
  return {
    marketCount: input.markets.length,
    totalCandles: input.markets.reduce((sum, market) => sum + market.candleCount, 0),
    skippedMarkets: input.warnings.filter((warning) => warning.code === "missing-candles")
      .length,
    skippedMissingCandles: input.markets.reduce(
      (sum, market) => sum + market.skippedMissingCandles,
      0,
    ),
  };
}

function buildEmptyAnalysis(input: {
  inputRoot: string;
  outputPath: string;
  generatedAt: string;
  maxLag: number;
  warnings: readonly LeadLagWarning[];
}): LeadLagAnalysis {
  const emptyLagMetrics = Array.from({ length: input.maxLag + 1 }, (_, lag) => ({
    lag,
    correlation: null,
    crossCorrelation: null,
    direction: "insufficient-data" as const,
    observationCount: 0,
  }));

  return {
    generatedAt: input.generatedAt,
    inputRoot: input.inputRoot,
    outputPath: input.outputPath,
    maxLag: input.maxLag,
    sampleCounts: {
      marketCount: 0,
      totalCandles: 0,
      skippedMarkets: 0,
      skippedMissingCandles: 0,
    },
    aggregateLagMetrics: emptyLagMetrics,
    markets: [],
    warnings: sortWarnings(input.warnings),
  };
}

/** Builds a deterministic lead-lag analysis from scanned research outputs. */
export function buildLeadLagAnalysis(
  input: BuildLeadLagAnalysisInput,
): LeadLagAnalysis {
  const maxLag = input.maxLag ?? DEFAULT_LEAD_LAG_MAX_LAG;
  const warnings: LeadLagWarning[] = [];
  const markets: LeadLagMarketSeries[] = [];
  const candleSeries: Array<ReturnType<typeof extractLeadLagCandlesFromResearchOutput>["candles"]> =
    [];

  if (input.scanned.length === 0) {
    warnings.push({
      code: "empty-dataset",
      message: "No research outputs found for lead-lag analysis",
    });

    return buildEmptyAnalysis({
      inputRoot: input.inputRoot,
      outputPath: input.outputPath,
      generatedAt: input.generatedAt,
      maxLag,
      warnings,
    });
  }

  for (const entry of [...input.scanned].sort((left, right) =>
    left.marketTicker.localeCompare(right.marketTicker),
  )) {
    const extracted = extractLeadLagCandlesFromResearchOutput(
      entry.outputJson,
      entry.outputPath,
      {
        strategyId: entry.strategyId,
        seriesTicker: entry.seriesTicker,
        marketTicker: entry.marketTicker,
      },
    );

    warnings.push(...extracted.warnings);

    if (extracted.candles.length === 0) {
      continue;
    }

    const lagMetrics = computeLeadLagMetricsForCandles(extracted.candles, maxLag);
    const { bestLag, bestDirection } = selectBestLag(lagMetrics);

    markets.push({
      strategyId: extracted.strategyId,
      seriesTicker: extracted.seriesTicker,
      marketTicker: extracted.marketTicker,
      outputPath: entry.outputPath,
      candleCount: extracted.candles.length,
      skippedMissingCandles: extracted.skippedMissingCandles,
      lagMetrics,
      bestLag,
      bestDirection,
    });
    candleSeries.push(extracted.candles);
  }

  const sortedMarkets = sortMarkets(markets);

  return {
    generatedAt: input.generatedAt,
    inputRoot: input.inputRoot,
    outputPath: input.outputPath,
    maxLag,
    sampleCounts: buildSampleCounts({ markets: sortedMarkets, warnings }),
    aggregateLagMetrics: computeAggregateLeadLagMetrics(candleSeries, maxLag),
    markets: sortedMarkets,
    warnings: sortWarnings(warnings),
  };
}

export function buildLeadLagAnalysisFromDirectories(
  inputRoot: string,
  outputPath: string,
  io: LeadLagIo,
  options: { generatedAt: string; maxLag?: number },
): LeadLagAnalysis {
  const scanned = scanCalibrationResearchOutputs(inputRoot, io);

  return buildLeadLagAnalysis({
    inputRoot,
    outputPath,
    generatedAt: options.generatedAt,
    maxLag: options.maxLag,
    scanned,
  });
}

export function serializeLeadLagAnalysis(analysis: LeadLagAnalysis): string {
  return stableStringify(analysis);
}
