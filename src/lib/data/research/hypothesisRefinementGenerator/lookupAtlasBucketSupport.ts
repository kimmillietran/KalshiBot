import type { MispricingAtlas } from "@/lib/data/research/mispricingAtlas/mispricingAtlasTypes";

function findBucketObservations(
  buckets: readonly { bucketId: string; observations: number }[],
  bucketId: string,
): number | null {
  const match = buckets.find((bucket) => bucket.bucketId === bucketId);
  return match?.observations ?? null;
}

/** Returns atlas observation count for a bucket id when mispricing-atlas is available. */
export function lookupAtlasBucketSupport(
  atlas: MispricingAtlas | null,
  bucketId: string,
): number | null {
  if (!atlas) {
    return null;
  }

  const coarseGroups = atlas.coarseBuckets;
  if (coarseGroups) {
    for (const buckets of Object.values(coarseGroups)) {
      const observations = findBucketObservations(buckets, bucketId);
      if (observations !== null) {
        return observations;
      }
    }
  }

  for (const buckets of [
    atlas.momentumBuckets ?? [],
    atlas.probabilityBuckets,
    atlas.timeRemainingBuckets,
    atlas.moneynessBuckets,
    atlas.volatilityBuckets,
  ]) {
    const observations = findBucketObservations(buckets, bucketId);
    if (observations !== null) {
      return observations;
    }
  }

  return null;
}
