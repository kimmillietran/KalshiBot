/**
 * Linear-interpolation quantile for pre-sorted numeric samples.
 * @param quantile Value in [0, 1] (0 = min, 1 = max).
 */
export function quantile(sortedValues: readonly number[], quantile: number): number {
  if (sortedValues.length === 0) {
    return 0;
  }

  if (sortedValues.length === 1) {
    return sortedValues[0]!;
  }

  const index = (sortedValues.length - 1) * quantile;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);

  if (lower === upper) {
    return sortedValues[lower]!;
  }

  const weight = index - lower;
  return (
    sortedValues[lower]! * (1 - weight)
    + sortedValues[upper]! * weight
  );
}

/** Percentile on a 0–100 scale for pre-sorted samples. */
export function percentile(sortedValues: readonly number[], pct: number): number {
  return quantile(sortedValues, pct / 100);
}

/** Arithmetic mean; null when the input is empty. */
export function averageFinite(values: readonly number[]): number | null {
  if (values.length === 0) {
    return null;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}
