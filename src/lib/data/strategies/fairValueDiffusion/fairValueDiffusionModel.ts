import { stableStdDev } from "@/lib/features/normalize";
import type { EvaluationCandleSnapshot } from "@/types/domain/trading";

const MS_PER_YEAR = 365.25 * 24 * 60 * 60 * 1_000;
const DEFAULT_BAR_INTERVAL_MS = 60_000;
const MIN_ANNUALIZED_VOL = 1e-6;
const MIN_TIME_REMAINING_MS = 1;

export type FairValueDiffusionInput = {
  spotPrice: number;
  strikePrice: number;
  timeRemainingMs: number;
  candles: readonly EvaluationCandleSnapshot[];
  volatilityLookbackBars: number;
};

export type RealizedVolatilityEstimate = {
  annualizedVol: number;
  barIntervalMs: number;
  sampleCount: number;
};

export type FairProbabilityEstimate = {
  fairYesProbability: number;
  annualizedVol: number;
  dScore: number;
};

export type EdgeEstimate = {
  fairYesProbabilityCents: number;
  impliedYesMidCents: number;
  edgeCents: number;
};

/** Abramowitz & Stegun 7.1.26 — deterministic standard normal CDF. */
export function normalCdf(value: number): number {
  if (!Number.isFinite(value)) {
    return value > 0 ? 1 : 0;
  }

  const sign = value < 0 ? -1 : 1;
  const x = Math.abs(value) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const erfApprox =
    1
    - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592)
      * t
      * Math.exp(-x * x);

  return 0.5 * (1 + sign * erfApprox);
}

export function inferBarIntervalMs(
  candles: readonly EvaluationCandleSnapshot[],
): number {
  if (candles.length < 2) {
    return DEFAULT_BAR_INTERVAL_MS;
  }

  const last = candles[candles.length - 1]?.timestamp;
  const previous = candles[candles.length - 2]?.timestamp;

  if (
    last === undefined
    || previous === undefined
    || !Number.isFinite(last)
    || !Number.isFinite(previous)
    || last <= previous
  ) {
    return DEFAULT_BAR_INTERVAL_MS;
  }

  return last - previous;
}

export function computeLogReturns(
  closes: readonly number[],
): number[] | null {
  if (closes.length < 2) {
    return null;
  }

  const returns: number[] = [];
  for (let index = 1; index < closes.length; index += 1) {
    const previous = closes[index - 1];
    const current = closes[index];

    if (
      previous === undefined
      || current === undefined
      || !Number.isFinite(previous)
      || !Number.isFinite(current)
      || previous <= 0
      || current <= 0
    ) {
      return null;
    }

    returns.push(Math.log(current / previous));
  }

  return returns;
}

export function estimateRealizedVolatility(
  candles: readonly EvaluationCandleSnapshot[],
  volatilityLookbackBars: number,
): RealizedVolatilityEstimate | null {
  if (volatilityLookbackBars < 2 || candles.length < volatilityLookbackBars + 1) {
    return null;
  }

  const window = candles.slice(-(volatilityLookbackBars + 1));
  const closes = window.map((candle) => candle.close);
  const logReturns = computeLogReturns(closes);

  if (logReturns === null || logReturns.length < volatilityLookbackBars) {
    return null;
  }

  const perBarVol = stableStdDev(logReturns.slice(-volatilityLookbackBars));
  const barIntervalMs = inferBarIntervalMs(window);
  const barsPerYear = MS_PER_YEAR / barIntervalMs;
  const annualizedVol = Math.max(perBarVol * Math.sqrt(barsPerYear), MIN_ANNUALIZED_VOL);

  return {
    annualizedVol,
    barIntervalMs,
    sampleCount: logReturns.length,
  };
}

export function estimateFairYesProbability(
  input: FairValueDiffusionInput,
  annualizedVol: number,
): FairProbabilityEstimate | null {
  const {
    spotPrice,
    strikePrice,
    timeRemainingMs,
  } = input;

  if (
    !Number.isFinite(spotPrice)
    || !Number.isFinite(strikePrice)
    || spotPrice <= 0
    || strikePrice <= 0
    || timeRemainingMs < MIN_TIME_REMAINING_MS
    || !Number.isFinite(annualizedVol)
    || annualizedVol <= 0
  ) {
    return null;
  }

  const timeYears = timeRemainingMs / MS_PER_YEAR;
  const volSqrtT = annualizedVol * Math.sqrt(timeYears);

  if (volSqrtT <= 0) {
    if (spotPrice > strikePrice) {
      return { fairYesProbability: 1, annualizedVol, dScore: Number.POSITIVE_INFINITY };
    }
    if (spotPrice < strikePrice) {
      return { fairYesProbability: 0, annualizedVol, dScore: Number.NEGATIVE_INFINITY };
    }
    return { fairYesProbability: 0.5, annualizedVol, dScore: 0 };
  }

  const dScore = Math.log(spotPrice / strikePrice) / volSqrtT;
  const fairYesProbability = normalCdf(dScore);

  return {
    fairYesProbability,
    annualizedVol,
    dScore,
  };
}

export function computeEdgeCents(
  fairYesProbability: number,
  impliedYesMidCents: number,
): EdgeEstimate | null {
  if (
    !Number.isFinite(fairYesProbability)
    || !Number.isFinite(impliedYesMidCents)
    || fairYesProbability < 0
    || fairYesProbability > 1
  ) {
    return null;
  }

  const fairYesProbabilityCents = fairYesProbability * 100;
  return {
    fairYesProbabilityCents,
    impliedYesMidCents,
    edgeCents: fairYesProbabilityCents - impliedYesMidCents,
  };
}

export function evaluateFairValueDiffusion(
  input: FairValueDiffusionInput,
): {
  volatility: RealizedVolatilityEstimate;
  probability: FairProbabilityEstimate;
} | null {
  const volatility = estimateRealizedVolatility(
    input.candles,
    input.volatilityLookbackBars,
  );

  if (volatility === null) {
    return null;
  }

  const probability = estimateFairYesProbability(input, volatility.annualizedVol);
  if (probability === null) {
    return null;
  }

  return { volatility, probability };
}
