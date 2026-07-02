import { DEFAULT_CALIBRATION_BIN_COUNT } from "@/lib/data/research/calibration/calibrationTypes";

export type NumericBucketDefinition = {
  bucketId: string;
  bucketLabel: string;
  minInclusive: number;
  maxExclusive: number | null;
};

export const PROBABILITY_BUCKET_COUNT = DEFAULT_CALIBRATION_BIN_COUNT;
export const COARSE_PROBABILITY_ONLY_BIN_COUNT = 5;
export const COARSE_PROBABILITY_AXIS_BIN_COUNT = 3;

export const COARSE_TIME_REMAINING_AXIS_DEFINITIONS: readonly NumericBucketDefinition[] = [
  {
    bucketId: "coarse-time-early",
    bucketLabel: "< 15 minutes remaining",
    minInclusive: 0,
    maxExclusive: 15 * 60 * 1_000,
  },
  {
    bucketId: "coarse-time-late",
    bucketLabel: ">= 15 minutes remaining",
    minInclusive: 15 * 60 * 1_000,
    maxExclusive: null,
  },
];

export const COARSE_VOLATILITY_REGIME_DEFINITIONS: readonly {
  bucketId: string;
  bucketLabel: string;
  regimeTag: "low" | "medium" | "high";
}[] = [
  {
    bucketId: "coarse-regime-low",
    bucketLabel: "low volatility regime",
    regimeTag: "low",
  },
  {
    bucketId: "coarse-regime-medium",
    bucketLabel: "medium volatility regime",
    regimeTag: "medium",
  },
  {
    bucketId: "coarse-regime-high",
    bucketLabel: "high volatility regime",
    regimeTag: "high",
  },
];

export const TIME_REMAINING_BUCKET_DEFINITIONS: readonly NumericBucketDefinition[] = [
  {
    bucketId: "time-0-5m",
    bucketLabel: "0-5 minutes remaining",
    minInclusive: 0,
    maxExclusive: 5 * 60 * 1_000,
  },
  {
    bucketId: "time-5-15m",
    bucketLabel: "5-15 minutes remaining",
    minInclusive: 5 * 60 * 1_000,
    maxExclusive: 15 * 60 * 1_000,
  },
  {
    bucketId: "time-15-30m",
    bucketLabel: "15-30 minutes remaining",
    minInclusive: 15 * 60 * 1_000,
    maxExclusive: 30 * 60 * 1_000,
  },
  {
    bucketId: "time-30m-plus",
    bucketLabel: "30+ minutes remaining",
    minInclusive: 30 * 60 * 1_000,
    maxExclusive: null,
  },
];

export const MONEYNESS_BUCKET_DEFINITIONS: readonly NumericBucketDefinition[] = [
  {
    bucketId: "moneyness-below-2pct",
    bucketLabel: "< -2% from strike",
    minInclusive: Number.NEGATIVE_INFINITY,
    maxExclusive: -2,
  },
  {
    bucketId: "moneyness-near-below",
    bucketLabel: "-2% to 0% from strike",
    minInclusive: -2,
    maxExclusive: 0,
  },
  {
    bucketId: "moneyness-near-above",
    bucketLabel: "0% to 2% from strike",
    minInclusive: 0,
    maxExclusive: 2,
  },
  {
    bucketId: "moneyness-above-2pct",
    bucketLabel: ">= 2% from strike",
    minInclusive: 2,
    maxExclusive: null,
  },
];

export const VOLATILITY_BUCKET_DEFINITIONS: readonly NumericBucketDefinition[] = [
  {
    bucketId: "vol-low",
    bucketLabel: "Low (<30% annualized)",
    minInclusive: 0,
    maxExclusive: 0.3,
  },
  {
    bucketId: "vol-medium",
    bucketLabel: "Medium (30-60% annualized)",
    minInclusive: 0.3,
    maxExclusive: 0.6,
  },
  {
    bucketId: "vol-high",
    bucketLabel: "High (>=60% annualized)",
    minInclusive: 0.6,
    maxExclusive: null,
  },
];

export function valueFitsBucket(
  value: number,
  bucket: NumericBucketDefinition,
): boolean {
  if (value < bucket.minInclusive) {
    return false;
  }

  if (bucket.maxExclusive === null) {
    return true;
  }

  return value < bucket.maxExclusive;
}

export function buildProbabilityBucketDefinitions(
  binCount: number = PROBABILITY_BUCKET_COUNT,
): readonly NumericBucketDefinition[] {
  const buckets: NumericBucketDefinition[] = [];

  for (let binIndex = 0; binIndex < binCount; binIndex += 1) {
    const minInclusive = binIndex / binCount;
    const maxExclusive = binIndex === binCount - 1 ? null : (binIndex + 1) / binCount;
    const maxLabel = binIndex === binCount - 1 ? "1.0]" : `${maxExclusive?.toFixed(1)})`;

    buckets.push({
      bucketId: `prob-${binIndex}`,
      bucketLabel: `[${minInclusive.toFixed(1)}, ${maxLabel}`,
      minInclusive,
      maxExclusive,
    });
  }

  return buckets;
}

export function buildCoarseProbabilityBucketDefinitions(
  binCount: number = COARSE_PROBABILITY_ONLY_BIN_COUNT,
): readonly NumericBucketDefinition[] {
  return buildProbabilityBucketDefinitions(binCount).map((definition) => ({
    ...definition,
    bucketId: definition.bucketId.replace(/^prob-/, "coarse-prob-"),
    bucketLabel: definition.bucketLabel,
  }));
}

export function buildCoarseProbabilityAxisDefinitions(
  binCount: number = COARSE_PROBABILITY_AXIS_BIN_COUNT,
): readonly NumericBucketDefinition[] {
  return buildCoarseProbabilityBucketDefinitions(binCount);
}

export function probabilityFitsBucket(
  probability: number,
  bucket: NumericBucketDefinition,
): boolean {
  if (probability < bucket.minInclusive) {
    return false;
  }

  if (bucket.maxExclusive === null) {
    return probability <= 1;
  }

  return probability < bucket.maxExclusive;
}
