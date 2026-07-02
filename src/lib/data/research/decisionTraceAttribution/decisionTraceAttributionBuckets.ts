import type { NumericBucketDefinition } from "../mispricingAtlas/mispricingAtlasBuckets";
import { valueFitsBucket } from "../mispricingAtlas/mispricingAtlasBuckets";

export const YES_MID_BUCKET_DEFINITIONS: readonly NumericBucketDefinition[] = [
  {
    bucketId: "yes-mid-low",
    bucketLabel: "0-33 cents",
    minInclusive: 0,
    maxExclusive: 34,
  },
  {
    bucketId: "yes-mid-mid",
    bucketLabel: "34-66 cents",
    minInclusive: 34,
    maxExclusive: 67,
  },
  {
    bucketId: "yes-mid-high",
    bucketLabel: "67-100 cents",
    minInclusive: 67,
    maxExclusive: 101,
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

export const BTC_RETURN_BUCKET_DEFINITIONS: readonly NumericBucketDefinition[] = [
  {
    bucketId: "btc-return-down",
    bucketLabel: "< -0.5%",
    minInclusive: Number.NEGATIVE_INFINITY,
    maxExclusive: -0.5,
  },
  {
    bucketId: "btc-return-flat",
    bucketLabel: "-0.5% to 0.5%",
    minInclusive: -0.5,
    maxExclusive: 0.5,
  },
  {
    bucketId: "btc-return-up",
    bucketLabel: ">= 0.5%",
    minInclusive: 0.5,
    maxExclusive: null,
  },
];

export const UNKNOWN_BUCKET_ID = "unknown";
export const UNKNOWN_BUCKET_LABEL = "Unknown / unavailable";

export function resolveNumericBucket(
  value: number | null,
  definitions: readonly NumericBucketDefinition[],
): { bucketId: string; bucketLabel: string } {
  if (value === null || !Number.isFinite(value)) {
    return { bucketId: UNKNOWN_BUCKET_ID, bucketLabel: UNKNOWN_BUCKET_LABEL };
  }

  for (const definition of definitions) {
    if (valueFitsBucket(value, definition)) {
      return { bucketId: definition.bucketId, bucketLabel: definition.bucketLabel };
    }
  }

  return { bucketId: UNKNOWN_BUCKET_ID, bucketLabel: UNKNOWN_BUCKET_LABEL };
}

export function resolveCategoricalBucket(value: string | null): {
  bucketId: string;
  bucketLabel: string;
} {
  if (!value || !value.trim()) {
    return { bucketId: UNKNOWN_BUCKET_ID, bucketLabel: UNKNOWN_BUCKET_LABEL };
  }

  const trimmed = value.trim();
  return { bucketId: trimmed, bucketLabel: trimmed };
}
