import { stableMean, stableStdDev } from "./normalize";
import type { FeatureCandle, RollingVolatilityFeature } from "./types";

/**
 * Rolling close-price std dev for trading features. Distinct from research
 * `estimateRealizedVolatility`; see FEATURE_SEMANTICS.md.
 */
export function rollingVolatility(
  candles: readonly FeatureCandle[],
  window = 10,
): RollingVolatilityFeature {
  if (candles.length === 0) {
    return { stdDev: 0, coefficientOfVariation: 0, bars: 0 };
  }

  const slice = candles.slice(-Math.max(window, 1));
  const closes = slice.map((candle) => candle.close);
  const stdDev = stableStdDev(closes);
  const mean = stableMean(closes);
  const coefficientOfVariation = mean === 0 ? 0 : stdDev / Math.abs(mean);

  return {
    stdDev,
    coefficientOfVariation,
    bars: slice.length,
  };
}
