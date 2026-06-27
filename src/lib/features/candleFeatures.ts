import type {
  FeatureCandle,
  HigherHighsFeature,
  HigherLowsFeature,
  LastCandleDirectionFeature,
} from "./types";

export function lastCandleDirection(
  candles: readonly FeatureCandle[],
): LastCandleDirectionFeature {
  if (candles.length === 0) {
    return { direction: null, change: 0 };
  }

  const last = candles[candles.length - 1];
  const change = last.close - last.open;

  if (Math.abs(change) < 1e-9) {
    return { direction: "flat", change: 0 };
  }

  return {
    direction: change > 0 ? "up" : "down",
    change,
  };
}

export function higherHighs(
  candles: readonly FeatureCandle[],
  window = 5,
): HigherHighsFeature {
  return countConsecutiveHigher(
    candles,
    window,
    (candle) => candle.high,
  );
}

export function higherLows(
  candles: readonly FeatureCandle[],
  window = 5,
): HigherLowsFeature {
  return countConsecutiveHigher(
    candles,
    window,
    (candle) => candle.low,
  );
}

function countConsecutiveHigher(
  candles: readonly FeatureCandle[],
  window: number,
  pick: (candle: FeatureCandle) => number,
): HigherHighsFeature {
  if (candles.length < 2 || window < 2) {
    return { streak: 0, isRising: false };
  }

  const slice = candles.slice(-window);
  let streak = 0;

  for (let index = slice.length - 1; index > 0; index -= 1) {
    if (pick(slice[index]) > pick(slice[index - 1])) {
      streak += 1;
    } else {
      break;
    }
  }

  return {
    streak,
    isRising: streak >= 2,
  };
}
