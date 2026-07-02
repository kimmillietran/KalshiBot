import { buildCalibrationMarketKey } from "@/lib/data/research/calibration/calibrationPaths";
import { estimateRealizedVolatility } from "@/lib/data/strategies/fairValueDiffusion/fairValueDiffusionModel";
import { trendStrength } from "@/lib/features/trend";
import type { FeatureCandle } from "@/lib/features/types";
import type { EvaluationCandleSnapshot } from "@/types/domain/trading";

import {
  classifyMarketState,
  classifyTrendRegime,
  classifyVolatilityRegime,
} from "./regimeTaggingBuckets";
import {
  DEFAULT_REGIME_VOLATILITY_LOOKBACK_BARS,
  type RegimeMarketEntry,
  type RegimeMarketMetrics,
  type RegimeMarketTags,
  type RegimeStepPoint,
  type RegimeTimeRemainingProfile,
} from "./regimeTaggingTypes";

function mean(values: readonly number[]): number | null {
  if (values.length === 0) {
    return null;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function buildFeatureCandles(steps: readonly RegimeStepPoint[]): FeatureCandle[] {
  return steps.map((step) => ({
    timestamp: step.timestampMs,
    open: step.btcPrice,
    high: step.btcPrice,
    low: step.btcPrice,
    close: step.btcPrice,
  }));
}

function buildEvaluationCandles(steps: readonly RegimeStepPoint[]): EvaluationCandleSnapshot[] {
  return buildFeatureCandles(steps);
}

function computeReturnPercent(first: number, last: number): number | null {
  if (first <= 0) {
    return null;
  }

  return ((last - first) / first) * 100;
}

function computeHalfReturnPercent(steps: readonly RegimeStepPoint[], half: "first" | "second"): number | null {
  if (steps.length < 2) {
    return null;
  }

  const midpoint = Math.floor(steps.length / 2);
  const slice =
    half === "first"
      ? steps.slice(0, Math.max(midpoint, 1))
      : steps.slice(Math.max(midpoint, 1));

  if (slice.length < 2) {
    return null;
  }

  return computeReturnPercent(slice[0]!.btcPrice, slice[slice.length - 1]!.btcPrice);
}

function buildTimeRemainingProfile(
  steps: readonly RegimeStepPoint[],
): RegimeTimeRemainingProfile | null {
  const values = steps
    .map((step) => step.timeRemainingMs)
    .filter((value): value is number => value !== null);

  if (values.length === 0) {
    return null;
  }

  return {
    minMs: Math.min(...values),
    maxMs: Math.max(...values),
    averageMs: mean(values) ?? 0,
  };
}

function computeRealizedVolatilityAnnualized(
  steps: readonly RegimeStepPoint[],
): number | null {
  const candles = buildEvaluationCandles(steps);
  const lookback = Math.min(
    DEFAULT_REGIME_VOLATILITY_LOOKBACK_BARS,
    Math.max(candles.length - 1, 2),
  );

  if (candles.length < lookback + 1) {
    return null;
  }

  return estimateRealizedVolatility(candles, lookback)?.annualizedVol ?? null;
}

/** Aggregates per-step observations into market-level regime metrics and tags. */
export function computeRegimeMarketEntry(input: {
  strategyId: string;
  seriesTicker: string;
  marketTicker: string;
  outputPath: string;
  steps: readonly RegimeStepPoint[];
}): RegimeMarketEntry {
  const candles = buildFeatureCandles(input.steps);
  const trend = trendStrength(candles);
  const firstPrice = input.steps[0]?.btcPrice ?? null;
  const lastPrice = input.steps[input.steps.length - 1]?.btcPrice ?? null;
  const prices = input.steps.map((step) => step.btcPrice);
  const minPrice = prices.length > 0 ? Math.min(...prices) : null;
  const maxPrice = prices.length > 0 ? Math.max(...prices) : null;

  const btcReturnPercent =
    firstPrice !== null && lastPrice !== null
      ? computeReturnPercent(firstPrice, lastPrice)
      : null;

  const rangePercent =
    firstPrice !== null && minPrice !== null && maxPrice !== null && firstPrice > 0
      ? ((maxPrice - minPrice) / firstPrice) * 100
      : null;

  const spreadValues = input.steps
    .map((step) => step.maxSpreadPercent)
    .filter((value): value is number => value !== null);

  const impliedProbabilities = input.steps.map((step) => step.impliedProbability);

  const metrics: RegimeMarketMetrics = {
    realizedVolatilityAnnualized: computeRealizedVolatilityAnnualized(input.steps),
    trendStrengthScore: trend.score,
    trendSlopePerBar: trend.slopePerBar,
    btcReturnPercent,
    rangePercent,
    timeRemainingProfile: buildTimeRemainingProfile(input.steps),
    averageSpreadPercent: mean(spreadValues),
    averageImpliedProbability: mean(impliedProbabilities),
    stepCount: input.steps.length,
  };

  const volatilityTag = classifyVolatilityRegime({
    realizedVolatilityAnnualized: metrics.realizedVolatilityAnnualized,
    rangePercent: metrics.rangePercent,
  });
  const trendTag =
    input.steps.length > 0 ? classifyTrendRegime(metrics.trendStrengthScore) : null;
  const marketStateTag = classifyMarketState({
    metrics,
    volatilityTag,
    trendTag,
    btcReturnFirstHalfPercent: computeHalfReturnPercent(input.steps, "first"),
    btcReturnSecondHalfPercent: computeHalfReturnPercent(input.steps, "second"),
  });

  const tags: RegimeMarketTags = {
    volatility: volatilityTag,
    trend: trendTag,
    marketState: marketStateTag,
  };

  return {
    joinKey: buildCalibrationMarketKey(
      input.strategyId,
      input.seriesTicker,
      input.marketTicker,
    ),
    strategyId: input.strategyId,
    seriesTicker: input.seriesTicker,
    marketTicker: input.marketTicker,
    outputPath: input.outputPath,
    metrics,
    tags,
  };
}
