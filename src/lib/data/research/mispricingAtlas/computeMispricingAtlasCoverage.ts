import { RESEARCH_AXIS_GROUPS } from "@/lib/data/research/dimensions";
import type { SingleAxisStateKey } from "@/lib/data/research/dimensions/types";

import type {
  MispricingAtlas,
  MispricingAtlasBucketSummary,
  MispricingAtlasCoverageDiagnostics,
  MispricingAtlasSampleCounts,
} from "./mispricingAtlasTypes";

export type MispricingAtlasBucketGroup = {
  dimension: string;
  buckets: readonly MispricingAtlasBucketSummary[];
};

function readSingleAxisBuckets(
  atlas: MispricingAtlas,
  stateKey: SingleAxisStateKey,
): readonly MispricingAtlasBucketSummary[] {
  if (stateKey === "momentumBuckets") {
    return atlas.momentumBuckets ?? [];
  }

  return atlas[stateKey] ?? [];
}

/** Collects bucket groups from atlas output using the dimension registry. */
export function collectMispricingAtlasBucketGroups(input: {
  probabilityBuckets: readonly MispricingAtlasBucketSummary[];
  timeRemainingBuckets: readonly MispricingAtlasBucketSummary[];
  moneynessBuckets: readonly MispricingAtlasBucketSummary[];
  volatilityBuckets: readonly MispricingAtlasBucketSummary[];
  momentumBuckets?: readonly MispricingAtlasBucketSummary[];
  hourUtcBuckets?: readonly MispricingAtlasBucketSummary[];
  dayOfWeekUtcBuckets?: readonly MispricingAtlasBucketSummary[];
  sessionBucketBuckets?: readonly MispricingAtlasBucketSummary[];
  weekendFlagBuckets?: readonly MispricingAtlasBucketSummary[];
  coarseBuckets?: MispricingAtlas["coarseBuckets"];
}): MispricingAtlasBucketGroup[] {
  const atlasLike = input as MispricingAtlas;

  return RESEARCH_AXIS_GROUPS.map((group) => {
    if (group.atlasSource.kind === "singleAxis") {
      return {
        dimension: group.groupId,
        buckets: readSingleAxisBuckets(atlasLike, group.atlasSource.stateKey),
      };
    }

    return {
      dimension: group.groupId,
      buckets: input.coarseBuckets?.[group.atlasSource.coarseBucketsKey] ?? [],
    };
  });
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
