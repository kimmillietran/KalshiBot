import type {
  CrossedTargetRecentlyFeature,
  DistanceToTargetFeature,
  FeatureCandle,
  PercentToTargetFeature,
} from "./types";

export function distanceToTarget(
  spotPrice: number,
  strikePrice: number,
): DistanceToTargetFeature {
  if (!Number.isFinite(spotPrice) || !Number.isFinite(strikePrice) || strikePrice <= 0) {
    return { absolute: 0, signed: 0, isAboveTarget: false };
  }

  const signed = spotPrice - strikePrice;
  return {
    absolute: Math.abs(signed),
    signed,
    isAboveTarget: signed >= 0,
  };
}

export function percentAboveTarget(
  spotPrice: number,
  strikePrice: number,
): PercentToTargetFeature {
  return percentToTarget(spotPrice, strikePrice);
}

export function percentToTarget(
  spotPrice: number,
  strikePrice: number,
): PercentToTargetFeature {
  if (!Number.isFinite(spotPrice) || !Number.isFinite(strikePrice) || strikePrice <= 0) {
    return { percent: 0 };
  }

  return {
    percent: ((spotPrice - strikePrice) / strikePrice) * 100,
  };
}

export function crossedTargetRecently(
  candles: readonly FeatureCandle[],
  strikePrice: number,
  lookback = 5,
): CrossedTargetRecentlyFeature {
  if (
    candles.length < 2 ||
    !Number.isFinite(strikePrice) ||
    strikePrice <= 0 ||
    lookback < 1
  ) {
    return { crossed: false, direction: null, barsAgo: null };
  }

  const start = Math.max(1, candles.length - lookback);
  for (let index = candles.length - 1; index >= start; index -= 1) {
    const prev = candles[index - 1];
    const curr = candles[index];
    const prevAbove = prev.close >= strikePrice;
    const currAbove = curr.close >= strikePrice;

    if (prevAbove === currAbove) continue;

    return {
      crossed: true,
      direction: currAbove ? "up" : "down",
      barsAgo: candles.length - 1 - index,
    };
  }

  return { crossed: false, direction: null, barsAgo: null };
}
