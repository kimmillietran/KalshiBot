import type { EvaluationCandleSnapshot } from "@/types/domain/trading";

export function readYesAskCents(
  pricing: { yesAskCents: number | null } | null | undefined,
): number | null {
  const yesAskCents = pricing?.yesAskCents;
  return yesAskCents === null || yesAskCents === undefined ? null : yesAskCents;
}

export function readYesMidCents(
  pricing: { yesMidCents: number | null } | null | undefined,
): number | null {
  const yesMidCents = pricing?.yesMidCents;
  return yesMidCents === null || yesMidCents === undefined ? null : yesMidCents;
}

export function computeBtcMomentumPct(
  candles: readonly EvaluationCandleSnapshot[],
  lookbackBars: number,
): number | null {
  if (lookbackBars < 2 || candles.length < lookbackBars) {
    return null;
  }

  const window = candles.slice(-lookbackBars);
  const firstClose = window[0]?.close;
  const lastClose = window[window.length - 1]?.close;

  if (
    firstClose === undefined
    || lastClose === undefined
    || !Number.isFinite(firstClose)
    || !Number.isFinite(lastClose)
    || firstClose === 0
  ) {
    return null;
  }

  return ((lastClose - firstClose) / firstClose) * 100;
}

export function computeRollingMean(values: readonly number[]): number | null {
  if (values.length === 0) {
    return null;
  }

  return values.reduce((total, value) => total + value, 0) / values.length;
}

export function appendRollingWindow(
  values: readonly number[],
  nextValue: number,
  windowSize: number,
): number[] {
  return [...values, nextValue].slice(-windowSize);
}
