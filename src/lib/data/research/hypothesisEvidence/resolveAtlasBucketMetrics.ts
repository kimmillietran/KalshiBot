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
    case "probabilityMoneyness":
      return findBucket(atlas.coarseBuckets?.probabilityMoneyness ?? [], bucketId);
    case "moneynessTime":
      return findBucket(atlas.coarseBuckets?.moneynessTime ?? [], bucketId);
    case "volatilityMoneyness":
      return findBucket(atlas.coarseBuckets?.volatilityMoneyness ?? [], bucketId);
    case "volatilityProbabilityTime":
      return findBucket(atlas.coarseBuckets?.volatilityProbabilityTime ?? [], bucketId);
    case "probabilityMomentum":
      return findBucket(atlas.coarseBuckets?.probabilityMomentum ?? [], bucketId);
    case "momentumTime":
      return findBucket(atlas.coarseBuckets?.momentumTime ?? [], bucketId);
    case "momentumVolatility":
      return findBucket(atlas.coarseBuckets?.momentumVolatility ?? [], bucketId);
    case "probabilityMomentumTime":
      return findBucket(atlas.coarseBuckets?.probabilityMomentumTime ?? [], bucketId);
    case "momentum":
      return findBucket(atlas.momentumBuckets ?? [], bucketId);
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
