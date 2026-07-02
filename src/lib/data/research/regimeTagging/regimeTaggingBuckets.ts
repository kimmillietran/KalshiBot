import type {
  MarketStateRegimeTag,
  RegimeMarketMetrics,
  TrendRegimeTag,
  VolatilityRegimeTag,
} from "./regimeTaggingTypes";

export const VOLATILITY_REGIME_THRESHOLDS = {
  lowMaxExclusive: 0.3,
  mediumMaxExclusive: 0.6,
} as const;

export const RANGE_PERCENT_VOLATILITY_FALLBACK = {
  lowMaxExclusive: 0.5,
  mediumMaxExclusive: 2,
} as const;

export const TREND_REGIME_SCORE_THRESHOLD = 0.05;
export const MARKET_STATE_TRENDING_SCORE_THRESHOLD = 0.15;
export const MARKET_STATE_QUIET_TREND_MAX = 0.05;
export const MARKET_STATE_QUIET_SPREAD_MAX_PERCENT = 5;
export const MARKET_STATE_REVERSAL_MIN_HALF_RETURN_PERCENT = 0.05;

export function classifyVolatilityRegime(input: {
  realizedVolatilityAnnualized: number | null;
  rangePercent: number | null;
}): VolatilityRegimeTag | null {
  if (input.realizedVolatilityAnnualized !== null) {
    if (input.realizedVolatilityAnnualized < VOLATILITY_REGIME_THRESHOLDS.lowMaxExclusive) {
      return "low";
    }

    if (input.realizedVolatilityAnnualized < VOLATILITY_REGIME_THRESHOLDS.mediumMaxExclusive) {
      return "medium";
    }

    return "high";
  }

  if (input.rangePercent === null) {
    return null;
  }

  if (input.rangePercent < RANGE_PERCENT_VOLATILITY_FALLBACK.lowMaxExclusive) {
    return "low";
  }

  if (input.rangePercent < RANGE_PERCENT_VOLATILITY_FALLBACK.mediumMaxExclusive) {
    return "medium";
  }

  return "high";
}

export function classifyTrendRegime(trendStrengthScore: number): TrendRegimeTag {
  if (trendStrengthScore > TREND_REGIME_SCORE_THRESHOLD) {
    return "uptrend";
  }

  if (trendStrengthScore < -TREND_REGIME_SCORE_THRESHOLD) {
    return "downtrend";
  }

  return "sideways";
}

export function classifyMarketState(input: {
  metrics: RegimeMarketMetrics;
  volatilityTag: VolatilityRegimeTag | null;
  trendTag: TrendRegimeTag | null;
  btcReturnFirstHalfPercent: number | null;
  btcReturnSecondHalfPercent: number | null;
}): MarketStateRegimeTag | null {
  if (input.metrics.stepCount === 0) {
    return null;
  }

  const firstSign = Math.sign(input.btcReturnFirstHalfPercent ?? 0);
  const secondSign = Math.sign(input.btcReturnSecondHalfPercent ?? 0);

  if (
    firstSign !== 0
    && secondSign !== 0
    && firstSign !== secondSign
    && Math.abs(input.btcReturnFirstHalfPercent ?? 0)
      >= MARKET_STATE_REVERSAL_MIN_HALF_RETURN_PERCENT
    && Math.abs(input.btcReturnSecondHalfPercent ?? 0)
      >= MARKET_STATE_REVERSAL_MIN_HALF_RETURN_PERCENT
  ) {
    return "reversal";
  }

  if (
    Math.abs(input.metrics.trendStrengthScore) >= MARKET_STATE_TRENDING_SCORE_THRESHOLD
  ) {
    return "trending";
  }

  if (
    input.volatilityTag === "low"
    && Math.abs(input.metrics.trendStrengthScore) < MARKET_STATE_QUIET_TREND_MAX
    && (input.metrics.averageSpreadPercent ?? Number.POSITIVE_INFINITY)
      < MARKET_STATE_QUIET_SPREAD_MAX_PERCENT
  ) {
    return "quiet";
  }

  return "choppy";
}

export function createEmptySummaryCounts(): import("./regimeTaggingTypes").RegimeSummaryCounts {
  return {
    volatility: { low: 0, medium: 0, high: 0 },
    trend: { uptrend: 0, downtrend: 0, sideways: 0 },
    marketState: { quiet: 0, trending: 0, reversal: 0, choppy: 0 },
  };
}
