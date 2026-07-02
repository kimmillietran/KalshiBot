import {
  estimateRealizedVolatility,
  inferBarIntervalMs,
  normalCdf,
} from "@/lib/data/strategies/fairValueDiffusion/fairValueDiffusionModel";
import type { EvaluationCandleSnapshot } from "@/types/domain/trading";

import {
  ImpliedVolatilityInversionCode,
  type ImpliedVolatilityInversionCode as ImpliedVolatilityInversionCodeType,
} from "./volPremiumTypes";

const MS_PER_YEAR = 365.25 * 24 * 60 * 60 * 1_000;
const MIN_TIME_REMAINING_MS = 1;
const MIN_ANNUALIZED_VOL = 1e-6;
const ATM_LOG_MONEYNESS_EPSILON = 1e-6;
const PROBABILITY_EPSILON = 1e-9;

export type ImpliedVolatilityInput = {
  impliedProbability: number;
  spotPrice: number;
  strikePrice: number;
  timeRemainingMs: number;
};

export type ImpliedVolatilitySuccess = {
  ok: true;
  annualizedVol: number;
  dScore: number;
};

export type ImpliedVolatilityFailure = {
  ok: false;
  code: ImpliedVolatilityInversionCodeType;
};

export type ImpliedVolatilityResult = ImpliedVolatilitySuccess | ImpliedVolatilityFailure;

/** Inverts Φ(p) via Newton-Raphson on the same normalCdf used by diffusion pricing. */
export function normalInv(probability: number): number | null {
  if (
    !Number.isFinite(probability)
    || probability <= 0
    || probability >= 1
  ) {
    return null;
  }

  if (probability === 0.5) {
    return 0;
  }

  let x = probability < 0.5 ? -1 : 1;

  for (let iteration = 0; iteration < 32; iteration += 1) {
    const cdf = normalCdf(x);
    const pdf = Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);

    if (pdf <= 0) {
      break;
    }

    const delta = (cdf - probability) / pdf;
    x -= delta;

    if (Math.abs(delta) < 1e-12) {
      break;
    }
  }

  return x;
}

/** Inverts Kalshi implied probability into annualized diffusion volatility. */
export function estimateImpliedVolatility(
  input: ImpliedVolatilityInput,
): ImpliedVolatilityResult {
  const {
    impliedProbability,
    spotPrice,
    strikePrice,
    timeRemainingMs,
  } = input;

  if (
    !Number.isFinite(impliedProbability)
    || !Number.isFinite(spotPrice)
    || !Number.isFinite(strikePrice)
    || spotPrice <= 0
    || strikePrice <= 0
  ) {
    return { ok: false, code: ImpliedVolatilityInversionCode.MISSING_INPUT };
  }

  if (
    impliedProbability <= PROBABILITY_EPSILON
    || impliedProbability >= 1 - PROBABILITY_EPSILON
  ) {
    return { ok: false, code: ImpliedVolatilityInversionCode.BOUNDARY_PROBABILITY };
  }

  if (timeRemainingMs < MIN_TIME_REMAINING_MS) {
    return { ok: false, code: ImpliedVolatilityInversionCode.ZERO_TIME };
  }

  const dScore = normalInv(impliedProbability);
  if (dScore === null) {
    return { ok: false, code: ImpliedVolatilityInversionCode.BOUNDARY_PROBABILITY };
  }

  const logMoneyness = Math.log(spotPrice / strikePrice);

  if (Math.abs(dScore) < PROBABILITY_EPSILON) {
    if (Math.abs(logMoneyness) > ATM_LOG_MONEYNESS_EPSILON) {
      return { ok: false, code: ImpliedVolatilityInversionCode.ATM_MISMATCH };
    }

    return {
      ok: true,
      annualizedVol: MIN_ANNUALIZED_VOL,
      dScore: 0,
    };
  }

  const timeYears = timeRemainingMs / MS_PER_YEAR;
  const sqrtTime = Math.sqrt(timeYears);
  const annualizedVol = Math.abs(logMoneyness / (dScore * sqrtTime));

  if (!Number.isFinite(annualizedVol) || annualizedVol <= 0) {
    return { ok: false, code: ImpliedVolatilityInversionCode.ATM_MISMATCH };
  }

  return {
    ok: true,
    annualizedVol: Math.max(annualizedVol, MIN_ANNUALIZED_VOL),
    dScore,
  };
}

export function computeVolPremium(
  impliedVolatilityAnnualized: number | null,
  realizedVolatilityForwardAnnualized: number | null,
): number | null {
  if (
    impliedVolatilityAnnualized === null
    || realizedVolatilityForwardAnnualized === null
    || !Number.isFinite(impliedVolatilityAnnualized)
    || !Number.isFinite(realizedVolatilityForwardAnnualized)
  ) {
    return null;
  }

  return impliedVolatilityAnnualized - realizedVolatilityForwardAnnualized;
}

export function sliceForwardCandles(
  candles: readonly EvaluationCandleSnapshot[],
  evalTimestamp: number,
  closeTimestamp: number,
): EvaluationCandleSnapshot[] {
  return candles.filter(
    (candle) =>
      candle.timestamp > evalTimestamp && candle.timestamp <= closeTimestamp,
  );
}

/** Realized vol over candles strictly after evaluation through market close. */
export function estimateForwardRealizedVolatility(
  candles: readonly EvaluationCandleSnapshot[],
  evalTimestamp: number,
  closeTimestamp: number,
  volatilityLookbackBars: number,
): ReturnType<typeof estimateRealizedVolatility> {
  if (!Number.isFinite(closeTimestamp) || closeTimestamp <= evalTimestamp) {
    return null;
  }

  const forwardWindow = sliceForwardCandles(candles, evalTimestamp, closeTimestamp);
  if (forwardWindow.length < volatilityLookbackBars + 1) {
    return null;
  }

  return estimateRealizedVolatility(forwardWindow, volatilityLookbackBars);
}

/** Backward realized vol using candles available at evaluation time. */
export function estimateBackwardRealizedVolatility(
  candles: readonly EvaluationCandleSnapshot[],
  volatilityLookbackBars: number,
): ReturnType<typeof estimateRealizedVolatility> {
  return estimateRealizedVolatility(candles, volatilityLookbackBars);
}

export function roundVolMetric(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

/** Round-trip helper for tests: σ → p via diffusion CDF. */
export function probabilityFromDiffusionVol(input: {
  spotPrice: number;
  strikePrice: number;
  timeRemainingMs: number;
  annualizedVol: number;
}): number | null {
  const timeYears = input.timeRemainingMs / MS_PER_YEAR;
  const volSqrtT = input.annualizedVol * Math.sqrt(timeYears);

  if (volSqrtT <= 0) {
    if (input.spotPrice > input.strikePrice) {
      return 1;
    }
    if (input.spotPrice < input.strikePrice) {
      return 0;
    }
    return 0.5;
  }

  const dScore = Math.log(input.spotPrice / input.strikePrice) / volSqrtT;
  return normalCdf(dScore);
}

export function inferEvaluationTimestamp(
  candles: readonly EvaluationCandleSnapshot[],
): number | null {
  if (candles.length === 0) {
    return null;
  }

  const last = candles[candles.length - 1];
  return last?.timestamp ?? null;
}

export function annualizedVolFromBarVol(
  perBarVol: number,
  barIntervalMs: number,
): number {
  const barsPerYear = MS_PER_YEAR / barIntervalMs;
  return Math.max(perBarVol * Math.sqrt(barsPerYear), MIN_ANNUALIZED_VOL);
}

export { inferBarIntervalMs, normalCdf };
