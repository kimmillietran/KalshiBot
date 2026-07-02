import { fnv1a32 } from "@/lib/trading/config/hashConfig";

export type DeterministicSampleContext = {
  seed: number;
  simulationIndex: number;
  drawIndex: number;
  upperBound: number;
};

/** Deterministic uniform index in [0, upperBound) using FNV-1a hashing. */
export function deterministicUniformIndex(context: DeterministicSampleContext): number {
  if (context.upperBound <= 0) {
    return 0;
  }

  const digest = fnv1a32(
    `sig:${context.seed}:${context.simulationIndex}:${context.drawIndex}`,
  );
  return parseInt(digest, 16) % context.upperBound;
}

/** Linear-interpolation percentile for sorted values. */
export function percentile(sortedValues: readonly number[], pct: number): number {
  if (sortedValues.length === 0) {
    return 0;
  }

  if (sortedValues.length === 1) {
    return sortedValues[0]!;
  }

  const rank = (pct / 100) * (sortedValues.length - 1);
  const lowerIndex = Math.floor(rank);
  const upperIndex = Math.ceil(rank);

  if (lowerIndex === upperIndex) {
    return sortedValues[lowerIndex]!;
  }

  const weight = rank - lowerIndex;
  return (
    sortedValues[lowerIndex]! * (1 - weight) +
    sortedValues[upperIndex]! * weight
  );
}

export function mean(values: readonly number[]): number {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function sampleStandardDeviation(values: readonly number[]): number | null {
  if (values.length < 2) {
    return null;
  }

  const average = mean(values);
  const variance =
    values.reduce((sum, value) => sum + (value - average) ** 2, 0) /
    (values.length - 1);

  return Math.sqrt(variance);
}
