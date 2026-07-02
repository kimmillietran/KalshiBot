import type { ResearchMarketResultSummary } from "../aggregation/researchAggregateTypes";
import type { ParsedStrategyAggregateSummary } from "../leaderboard/strategyLeaderboardTypes";

import {
  bootstrapMeanConfidenceInterval,
  bootstrapWinRateConfidenceInterval,
} from "./bootstrapConfidenceIntervals";
import { mean } from "./deterministicSampling";
import {
  computeStandardError,
  computeTStatistic,
  oneSampleTTestPValueGreaterThanZero,
} from "./studentTTest";
import {
  DEFAULT_BOOTSTRAP_SEED,
  DEFAULT_BOOTSTRAP_SIMULATION_COUNT,
  DEFAULT_CONFIDENCE_LEVEL,
  DEFAULT_SIGNIFICANCE_ALPHA,
  type CompletedMarketSample,
  type ExtractCompletedMarketSamplesInput,
  type StatisticalSignificanceConfig,
  type StrategyConfidenceIntervals95,
  type StrategyStatisticalSignificanceMetrics,
} from "./statisticalSignificanceTypes";

export function resolveStatisticalSignificanceConfig(
  partial?: Partial<StatisticalSignificanceConfig>,
): StatisticalSignificanceConfig {
  return {
    seed: partial?.seed ?? DEFAULT_BOOTSTRAP_SEED,
    simulationCount: partial?.simulationCount ?? DEFAULT_BOOTSTRAP_SIMULATION_COUNT,
    confidenceLevel: partial?.confidenceLevel ?? DEFAULT_CONFIDENCE_LEVEL,
    significanceAlpha: partial?.significanceAlpha ?? DEFAULT_SIGNIFICANCE_ALPHA,
  };
}

/** Extracts completed market samples used for significance analysis. */
export function extractCompletedMarketSamples(
  input: ExtractCompletedMarketSamplesInput,
): CompletedMarketSample[] {
  return input.markets
    .filter((market) => market.status === "completed" && market.metrics !== undefined)
    .map((market) => ({
      marketTicker: market.marketTicker,
      totalPnlCents: market.metrics!.totalPnlCents,
      winningTradeCount: market.metrics!.winningTradeCount,
      tradeCount: market.metrics!.tradeCount,
    }));
}

function buildConfidenceIntervals95(
  meanPnlBootstrap: StrategyStatisticalSignificanceMetrics["meanPnlBootstrapConfidenceInterval"],
  winRateBootstrap: StrategyStatisticalSignificanceMetrics["winRateBootstrapConfidenceInterval"],
): StrategyConfidenceIntervals95 {
  return {
    meanPnlCents: meanPnlBootstrap,
    winRatePct: winRateBootstrap,
  };
}

function isStatisticallySignificant(input: {
  sampleSize: number;
  meanPnlCents: number | null;
  pValueOneTailed: number | null;
  meanPnlBootstrapConfidenceInterval: StrategyStatisticalSignificanceMetrics["meanPnlBootstrapConfidenceInterval"];
  significanceAlpha: number;
}): boolean {
  if (input.sampleSize < 2) {
    return false;
  }

  if (input.meanPnlCents === null || input.meanPnlCents <= 0) {
    return false;
  }

  if (
    input.pValueOneTailed === null ||
    input.pValueOneTailed >= input.significanceAlpha
  ) {
    return false;
  }

  if (input.meanPnlBootstrapConfidenceInterval === null) {
    return false;
  }

  return input.meanPnlBootstrapConfidenceInterval.lower > 0;
}

/** Computes statistical significance metrics for one strategy aggregate summary. */
export function computeStrategyStatisticalSignificance(
  summary: ParsedStrategyAggregateSummary,
  config: StatisticalSignificanceConfig,
): StrategyStatisticalSignificanceMetrics {
  const samples = extractCompletedMarketSamples({ markets: summary.markets });
  const pnlValues = samples.map((sample) => sample.totalPnlCents);
  const sampleSize = samples.length;
  const warnings: string[] = [];

  if (sampleSize === 0) {
    warnings.push("No completed markets available for significance analysis.");
  } else if (sampleSize === 1) {
    warnings.push(
      "Only one completed market; standard error and t-test are unavailable.",
    );
  } else if (sampleSize < 5) {
    warnings.push("Small sample size; confidence intervals may be unstable.");
  }

  const meanPnlCents = sampleSize === 0 ? null : mean(pnlValues);
  const meanPnlStandardError = computeStandardError(pnlValues);
  const meanPnlTStatistic = computeTStatistic(meanPnlCents ?? 0, meanPnlStandardError);
  const meanPnlPValueOneTailed =
    sampleSize < 2 || meanPnlTStatistic === null
      ? null
      : oneSampleTTestPValueGreaterThanZero(meanPnlTStatistic, sampleSize - 1);

  const bootstrapOptions = {
    seed: config.seed,
    simulationCount: config.simulationCount,
    confidenceLevel: config.confidenceLevel,
  };

  const meanPnlBootstrapConfidenceInterval = bootstrapMeanConfidenceInterval(
    pnlValues,
    bootstrapOptions,
  );
  const winRateBootstrapConfidenceInterval = bootstrapWinRateConfidenceInterval(
    samples,
    bootstrapOptions,
  );

  const totalTrades = samples.reduce((sum, sample) => sum + sample.tradeCount, 0);
  const totalWins = samples.reduce(
    (sum, sample) => sum + sample.winningTradeCount,
    0,
  );
  const winRatePct =
    totalTrades === 0 ? null : (totalWins / totalTrades) * 100;

  const confidenceInterval95 = buildConfidenceIntervals95(
    meanPnlBootstrapConfidenceInterval,
    winRateBootstrapConfidenceInterval,
  );

  return {
    strategyId: summary.strategyId,
    sampleSize,
    completedMarkets: summary.marketCounts.completed,
    totalTrades,
    meanPnlCents,
    meanPnlStandardError,
    meanPnlTStatistic,
    meanPnlPValueOneTailed,
    meanPnlBootstrapConfidenceInterval,
    winRatePct,
    winRateBootstrapConfidenceInterval,
    confidenceInterval95,
    statisticallySignificant: isStatisticallySignificant({
      sampleSize,
      meanPnlCents,
      pValueOneTailed: meanPnlPValueOneTailed,
      meanPnlBootstrapConfidenceInterval,
      significanceAlpha: config.significanceAlpha,
    }),
    insufficientSample: sampleSize < 2,
    warnings,
    sourcePaths: summary.sourcePaths,
  };
}

export function toLeaderboardSignificanceFields(
  metrics: StrategyStatisticalSignificanceMetrics,
): {
  sampleSize: number;
  confidenceInterval95: StrategyConfidenceIntervals95;
  statisticallySignificant: boolean;
} {
  return {
    sampleSize: metrics.sampleSize,
    confidenceInterval95: metrics.confidenceInterval95,
    statisticallySignificant: metrics.statisticallySignificant,
  };
}

export function summarizeMarketsForSignificance(
  markets: readonly ResearchMarketResultSummary[],
): {
  samples: CompletedMarketSample[];
  pnlValues: number[];
} {
  const samples = extractCompletedMarketSamples({ markets });
  return {
    samples,
    pnlValues: samples.map((sample) => sample.totalPnlCents),
  };
}
