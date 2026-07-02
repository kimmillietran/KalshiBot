import type {
  MispricingAtlasBucketSummary,
  MispricingAtlasCoverageDiagnostics,
  MispricingAtlasSampleCounts,
} from "./mispricingAtlasTypes";

export type MispricingAtlasBucketGroup = {
  dimension: string;
  buckets: readonly MispricingAtlasBucketSummary[];
};

export function collectMispricingAtlasBucketGroups(input: {
  probabilityBuckets: readonly MispricingAtlasBucketSummary[];
  timeRemainingBuckets: readonly MispricingAtlasBucketSummary[];
  moneynessBuckets: readonly MispricingAtlasBucketSummary[];
  volatilityBuckets: readonly MispricingAtlasBucketSummary[];
  coarseBuckets?: {
    probabilityOnly: readonly MispricingAtlasBucketSummary[];
    probabilityTime: readonly MispricingAtlasBucketSummary[];
    probabilityRegime: readonly MispricingAtlasBucketSummary[];
  };
}): MispricingAtlasBucketGroup[] {
  const groups: MispricingAtlasBucketGroup[] = [
    { dimension: "probability", buckets: input.probabilityBuckets },
    { dimension: "timeRemaining", buckets: input.timeRemainingBuckets },
    { dimension: "moneyness", buckets: input.moneynessBuckets },
    { dimension: "volatility", buckets: input.volatilityBuckets },
  ];

  if (input.coarseBuckets) {
    groups.push(
      { dimension: "probabilityOnly", buckets: input.coarseBuckets.probabilityOnly },
      { dimension: "probabilityTime", buckets: input.coarseBuckets.probabilityTime },
      { dimension: "probabilityRegime", buckets: input.coarseBuckets.probabilityRegime },
    );
  }

  return groups;
}

export function computeMispricingAtlasCoverageDiagnostics(input: {
  bucketGroups: readonly MispricingAtlasBucketGroup[];
  sampleCounts: MispricingAtlasSampleCounts;
  minSampleThreshold: number;
  topBucketLimit?: number;
}): MispricingAtlasCoverageDiagnostics {
  const topBucketLimit = input.topBucketLimit ?? 5;
  const allBuckets = input.bucketGroups.flatMap((group) =>
    group.buckets.map((bucket) => ({
      dimension: group.dimension,
      bucket,
    })),
  );

  const nonEmptyBuckets = allBuckets.filter(
    (entry) => entry.bucket.observations > 0,
  ).length;
  const bucketsBelowMinSampleThreshold = allBuckets.filter(
    (entry) =>
      entry.bucket.observations > 0
      && entry.bucket.observations < input.minSampleThreshold,
  ).length;

  const topBucketsBySampleSize = [...allBuckets]
    .sort((left, right) => {
      const observationCompare =
        right.bucket.observations - left.bucket.observations;
      if (observationCompare !== 0) {
        return observationCompare;
      }

      const dimensionCompare = left.dimension.localeCompare(right.dimension);
      if (dimensionCompare !== 0) {
        return dimensionCompare;
      }

      return left.bucket.bucketId.localeCompare(right.bucket.bucketId);
    })
    .slice(0, topBucketLimit)
    .map((entry) => ({
      bucketId: entry.bucket.bucketId,
      bucketLabel: entry.bucket.bucketLabel,
      dimension: entry.dimension,
      observations: entry.bucket.observations,
    }));

  return {
    totalAtlasObservations: input.sampleCounts.totalObservations,
    totalBuckets: allBuckets.length,
    nonEmptyBuckets,
    bucketsBelowMinSampleThreshold,
    minSampleThreshold: input.minSampleThreshold,
    largestBucketObservations: topBucketsBySampleSize[0]?.observations ?? 0,
    topBucketsBySampleSize,
    skipReasons: {
      missingSettlement: input.sampleCounts.skippedMissingSettlement,
      missingProbability: input.sampleCounts.skippedMissingProbability,
      missingContext: input.sampleCounts.skippedMissingContext,
    },
  };
}
