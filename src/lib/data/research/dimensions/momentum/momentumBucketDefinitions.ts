import type { NumericBucketDefinition } from "@/lib/data/research/dimensions/types";

import {
  MOMENTUM_MODERATE_THRESHOLD_PERCENT,
  MOMENTUM_STRONG_THRESHOLD_PERCENT,
} from "./momentumResearchTypes";

export const MOMENTUM_BUCKET_DEFINITIONS: readonly NumericBucketDefinition[] = [
  {
    bucketId: "momentum-strong-down",
    bucketLabel: "Strong Down (< -0.50%)",
    minInclusive: Number.NEGATIVE_INFINITY,
    maxExclusive: -MOMENTUM_STRONG_THRESHOLD_PERCENT,
  },
  {
    bucketId: "momentum-moderate-down",
    bucketLabel: "Moderate Down (-0.50% to -0.15%)",
    minInclusive: -MOMENTUM_STRONG_THRESHOLD_PERCENT,
    maxExclusive: -MOMENTUM_MODERATE_THRESHOLD_PERCENT,
  },
  {
    bucketId: "momentum-flat",
    bucketLabel: "Flat (-0.15% to 0.15%)",
    minInclusive: -MOMENTUM_MODERATE_THRESHOLD_PERCENT,
    maxExclusive: MOMENTUM_MODERATE_THRESHOLD_PERCENT,
  },
  {
    bucketId: "momentum-moderate-up",
    bucketLabel: "Moderate Up (0.15% to 0.50%)",
    minInclusive: MOMENTUM_MODERATE_THRESHOLD_PERCENT,
    maxExclusive: MOMENTUM_STRONG_THRESHOLD_PERCENT,
  },
  {
    bucketId: "momentum-strong-up",
    bucketLabel: "Strong Up (>= 0.50%)",
    minInclusive: MOMENTUM_STRONG_THRESHOLD_PERCENT,
    maxExclusive: null,
  },
];
