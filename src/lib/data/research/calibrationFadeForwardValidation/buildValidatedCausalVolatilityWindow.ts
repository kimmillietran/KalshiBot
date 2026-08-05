import type { EvaluationCandleSnapshot } from "@/types/domain/trading";
import { estimateRealizedVolatility } from "@/lib/data/strategies/fairValueDiffusion/fairValueDiffusionModel";

import type { BtcSpotPoint } from "../btcKalshiLeadLagAnalysis/causalBtcJoin";

export const VOLATILITY_WINDOW_REJECTION_REASONS = [
  "insufficient-source-points",
  "insufficient-bars",
  "missing-minute-bucket",
  "source-gap-exceeded",
  "invalid-source-price",
  "nonconsecutive-bars",
  "future-point-detected",
  "volatility-estimate-unavailable",
] as const;

export type VolatilityWindowRejectionReason = (typeof VOLATILITY_WINDOW_REJECTION_REASONS)[number];

export type ValidatedCausalVolatilityWindow = {
  available: boolean;
  candles: readonly EvaluationCandleSnapshot[];
  annualizedVolatility: number | null;
  windowStartMs: number | null;
  windowEndMs: number | null;
  sourcePointCount: number;
  barCount: number;
  maximumObservedSourceGapMs: number | null;
  rejectionReason: VolatilityWindowRejectionReason | null;
  /**
   * Causal bar policy (preserved from buildBtcCandlesUpToTimestamp):
   * the in-progress minute bucket that contains the quote timestamp is included
   * when at least one causal BTC sample falls in that minute. Only completed
   * minutes are not required; partial/current-bar closes use the latest causal
   * sample at or before the quote.
   */
  includesInProgressMinuteBar: boolean;
};

function rejected(
  reason: VolatilityWindowRejectionReason,
  partial: Partial<ValidatedCausalVolatilityWindow> = {},
): ValidatedCausalVolatilityWindow {
  return {
    available: false,
    candles: partial.candles ?? [],
    annualizedVolatility: null,
    windowStartMs: partial.windowStartMs ?? null,
    windowEndMs: partial.windowEndMs ?? null,
    sourcePointCount: partial.sourcePointCount ?? 0,
    barCount: partial.barCount ?? 0,
    maximumObservedSourceGapMs: partial.maximumObservedSourceGapMs ?? null,
    rejectionReason: reason,
    includesInProgressMinuteBar: partial.includesInProgressMinuteBar ?? false,
  };
}

function isValidPrice(priceUsd: number): boolean {
  return Number.isFinite(priceUsd) && priceUsd > 0;
}

/**
 * Builds a calibration-fade-specific validated causal volatility window.
 * Prefer this over changing global estimateRealizedVolatility.
 *
 * Requires lookbackBars+1 consecutive one-minute candles, source gaps
 * <= maximumSourceGapMs, no fill/interpolation, causal samples only.
 *
 * Input point order: assumes ascending timestamp order (same contract as
 * buildBtcCandlesUpToTimestamp / preloadBtcSpotSeries). Out-of-order inputs
 * are not re-sorted here.
 */
export function buildValidatedCausalVolatilityWindow(input: {
  points: readonly BtcSpotPoint[];
  timestampMs: number;
  barIntervalMs: number;
  lookbackBars: number;
  maximumSourceGapMs: number;
}): ValidatedCausalVolatilityWindow {
  const { timestampMs, barIntervalMs, lookbackBars, maximumSourceGapMs } = input;
  const requiredBars = lookbackBars + 1;

  let sawFuturePoint = false;
  const causalPoints: BtcSpotPoint[] = [];
  for (const point of input.points) {
    if (point.timestampMs > timestampMs) {
      sawFuturePoint = true;
      continue;
    }
    if (!isValidPrice(point.priceUsd)) {
      return rejected("invalid-source-price", {
        sourcePointCount: causalPoints.length,
      });
    }
    causalPoints.push(point);
  }

  if (sawFuturePoint && causalPoints.length === 0) {
    return rejected("future-point-detected");
  }

  if (causalPoints.length < requiredBars) {
    return rejected("insufficient-source-points", {
      sourcePointCount: causalPoints.length,
    });
  }

  // Build minute candles including the in-progress quote minute (preserved policy).
  const candles: EvaluationCandleSnapshot[] = [];
  let bucketStart = Math.floor(causalPoints[0]!.timestampMs / barIntervalMs) * barIntervalMs;
  let open = causalPoints[0]!.priceUsd;
  let high = open;
  let low = open;
  let close = open;

  for (const point of causalPoints) {
    const bucket = Math.floor(point.timestampMs / barIntervalMs) * barIntervalMs;
    if (bucket !== bucketStart) {
      candles.push({ timestamp: bucketStart, open, high, low, close });
      // Detect skipped minute buckets between samples (no forward-fill).
      const expectedNext = bucketStart + barIntervalMs;
      if (bucket > expectedNext) {
        // Continue building; consecutiveness is validated on the trailing window.
      }
      bucketStart = bucket;
      open = point.priceUsd;
      high = point.priceUsd;
      low = point.priceUsd;
      close = point.priceUsd;
      continue;
    }
    high = Math.max(high, point.priceUsd);
    low = Math.min(low, point.priceUsd);
    close = point.priceUsd;
  }
  candles.push({ timestamp: bucketStart, open, high, low, close });

  const quoteMinuteStart = Math.floor(timestampMs / barIntervalMs) * barIntervalMs;
  const includesInProgressMinuteBar =
    candles.length > 0 && candles[candles.length - 1]!.timestamp === quoteMinuteStart;

  if (candles.length < requiredBars) {
    return rejected("insufficient-bars", {
      candles,
      sourcePointCount: causalPoints.length,
      barCount: candles.length,
      includesInProgressMinuteBar,
    });
  }

  const window = candles.slice(-requiredBars);
  const windowStartMs = window[0]!.timestamp;
  const windowEndMs = window[window.length - 1]!.timestamp;

  for (let index = 1; index < window.length; index += 1) {
    const expected = window[index - 1]!.timestamp + barIntervalMs;
    const actual = window[index]!.timestamp;
    if (actual !== expected) {
      const reason: VolatilityWindowRejectionReason =
        actual > expected ? "missing-minute-bucket" : "nonconsecutive-bars";
      return rejected(reason, {
        candles: window,
        sourcePointCount: causalPoints.length,
        barCount: window.length,
        windowStartMs,
        windowEndMs,
        includesInProgressMinuteBar,
      });
    }
  }

  const windowPoints = causalPoints.filter(
    (point) => point.timestampMs >= windowStartMs && point.timestampMs <= timestampMs,
  );
  let maximumObservedSourceGapMs = 0;
  for (let index = 1; index < windowPoints.length; index += 1) {
    const gap = windowPoints[index]!.timestampMs - windowPoints[index - 1]!.timestampMs;
    maximumObservedSourceGapMs = Math.max(maximumObservedSourceGapMs, gap);
    if (gap > maximumSourceGapMs) {
      return rejected("source-gap-exceeded", {
        candles: window,
        sourcePointCount: windowPoints.length,
        barCount: window.length,
        windowStartMs,
        windowEndMs,
        maximumObservedSourceGapMs,
        includesInProgressMinuteBar,
      });
    }
  }

  const estimate = estimateRealizedVolatility(window, lookbackBars);
  if (!estimate || !Number.isFinite(estimate.annualizedVol)) {
    return rejected("volatility-estimate-unavailable", {
      candles: window,
      sourcePointCount: windowPoints.length,
      barCount: window.length,
      windowStartMs,
      windowEndMs,
      maximumObservedSourceGapMs,
      includesInProgressMinuteBar,
    });
  }

  return {
    available: true,
    candles: window,
    annualizedVolatility: estimate.annualizedVol,
    windowStartMs,
    windowEndMs,
    sourcePointCount: windowPoints.length,
    barCount: window.length,
    maximumObservedSourceGapMs,
    rejectionReason: null,
    includesInProgressMinuteBar,
  };
}
