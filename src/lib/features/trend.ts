import { clampSigned } from "./normalize";
import type { FeatureCandle, TrendStrengthFeature } from "./types";

export function trendStrength(
  candles: readonly FeatureCandle[],
): TrendStrengthFeature {
  if (candles.length < 2) {
    return { score: 0, direction: "neutral", slopePerBar: 0 };
  }

  const closes = candles.map((candle) => candle.close);
  const slopePerBar = linearRegressionSlope(closes);
  const first = closes[0];
  const normalizedSlope = first === 0 ? 0 : slopePerBar / Math.abs(first);
  const score = clampSigned(normalizedSlope * 50);

  let direction: TrendStrengthFeature["direction"] = "neutral";
  if (score > 0.05) direction = "bullish";
  else if (score < -0.05) direction = "bearish";

  return { score, direction, slopePerBar };
}

/** Simple OLS slope for evenly spaced bar indices. */
function linearRegressionSlope(values: readonly number[]): number {
  const n = values.length;
  if (n < 2) return 0;

  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumXX = 0;

  for (let index = 0; index < n; index += 1) {
    sumX += index;
    sumY += values[index];
    sumXY += index * values[index];
    sumXX += index * index;
  }

  const denominator = n * sumXX - sumX * sumX;
  if (denominator === 0) return 0;

  return (n * sumXY - sumX * sumY) / denominator;
}
