import type { NumericBucketDefinition } from "../mispricingAtlas/mispricingAtlasBuckets";
import { valueFitsBucket } from "../mispricingAtlas/mispricingAtlasBuckets";

export { TIME_REMAINING_BUCKET_DEFINITIONS } from "@/lib/data/research/dimensions/bucketDefinitions";

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
