import type { MispricingAtlas } from "@/lib/data/research/mispricingAtlas/mispricingAtlasTypes";
import type { MispricingAtlasBucketSummary } from "@/lib/data/research/mispricingAtlas/mispricingAtlasTypes";

import type { AtlasCandidateGroupId } from "./parseAtlasCandidateReference";

function findBucket(
  buckets: readonly MispricingAtlasBucketSummary[],
  bucketId: string,
): MispricingAtlasBucketSummary | null {
  return buckets.find((bucket) => bucket.bucketId === bucketId) ?? null;
}

/** Resolves atlas bucket metrics for a parsed atlas candidate reference. */
export function resolveAtlasBucketMetrics(
  atlas: MispricingAtlas,
  groupId: AtlasCandidateGroupId,
  bucketId: string,
): MispricingAtlasBucketSummary | null {
  switch (groupId) {
    case "probabilityOnly":
      return findBucket(atlas.coarseBuckets?.probabilityOnly ?? [], bucketId);
    case "probabilityTime":
      return findBucket(atlas.coarseBuckets?.probabilityTime ?? [], bucketId);
    case "probabilityRegime":
      return findBucket(atlas.coarseBuckets?.probabilityRegime ?? [], bucketId);
    case "probability":
      return findBucket(atlas.probabilityBuckets, bucketId);
    case "timeRemaining":
      return findBucket(atlas.timeRemainingBuckets, bucketId);
    case "moneyness":
      return findBucket(atlas.moneynessBuckets, bucketId);
    case "volatility":
      return findBucket(atlas.volatilityBuckets, bucketId);
    default:
      return null;
  }
}
