import type {
  FeatureCandle,
  PriceAccelerationFeature,
  PriceVelocityFeature,
  RecentMomentumFeature,
} from "./types";

/**
 * Short-window momentum for live feature vectors. Distinct from
 * `computeBtcMomentumPct` (research/strategy); see FEATURE_SEMANTICS.md.
 */
export function recentMomentum(
  candles: readonly FeatureCandle[],
  window = 5,
): RecentMomentumFeature {
  if (candles.length === 0) {
    return { change: 0, changePercent: 0, bars: 0 };
  }

  const slice = candles.slice(-Math.max(window, 1));
  if (slice.length === 1) {
    return { change: 0, changePercent: 0, bars: 1 };
  }

  const first = slice[0].close;
  const last = slice[slice.length - 1].close;
  const change = last - first;
  const changePercent = first === 0 ? 0 : (change / first) * 100;

  return {
    change,
    changePercent,
    bars: slice.length,
  };
}

export function priceVelocity(
  candles: readonly FeatureCandle[],
): PriceVelocityFeature {
  if (candles.length < 2) {
    return { perBar: 0, perMinute: 0 };
  }

  const first = candles[0];
  const last = candles[candles.length - 1];
  const barCount = candles.length - 1;
  const perBar = (last.close - first.close) / barCount;

  const elapsedMs = last.timestamp - first.timestamp;
  if (elapsedMs <= 0) {
    return { perBar, perMinute: 0 };
  }

  const elapsedMinutes = elapsedMs / 60_000;
  const perMinute = (last.close - first.close) / elapsedMinutes;

  return { perBar, perMinute };
}

export function priceAcceleration(
  candles: readonly FeatureCandle[],
): PriceAccelerationFeature {
  if (candles.length < 3) {
    return { deltaVelocityPerBar: 0 };
  }

  const midpoint = Math.floor(candles.length / 2);
  const firstHalf = candles.slice(0, midpoint + 1);
  const secondHalf = candles.slice(midpoint);

  const firstVelocity = priceVelocity(firstHalf).perBar;
  const secondVelocity = priceVelocity(secondHalf).perBar;
  const barGap = secondHalf.length - 1;

  if (barGap <= 0) {
    return { deltaVelocityPerBar: 0 };
  }

  return {
    deltaVelocityPerBar: (secondVelocity - firstVelocity) / barGap,
  };
}
