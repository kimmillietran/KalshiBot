import {
  collectMispricingAtlasBucketGroups,
  computeMispricingAtlasCoverageDiagnostics,
} from "@/lib/data/research/mispricingAtlas/computeMispricingAtlasCoverage";
import {
  computeCoarseMispricingBucketSummaries,
} from "@/lib/data/research/mispricingAtlas/computeMispricingBucketMetrics";
import type { MispricingAtlas } from "@/lib/data/research/mispricingAtlas/mispricingAtlasTypes";
import type {
  MispricingAtlasCoarseBuckets,
  MispricingAtlasCoverageDiagnostics,
} from "@/lib/data/research/mispricingAtlas/mispricingAtlasTypes";

export type NormalizedMispricingAtlas = MispricingAtlas & {
  coarseBuckets: MispricingAtlasCoarseBuckets;
  coverageDiagnostics: MispricingAtlasCoverageDiagnostics;
};

/** Fills coarse bucket shells and coverage when loading legacy atlas artifacts. */
export function normalizeMispricingAtlas(
  atlas: MispricingAtlas,
  minSampleThreshold: number,
): NormalizedMispricingAtlas {
  const coarseBuckets = atlas.coarseBuckets ?? {
    probabilityOnly: [],
    probabilityTime: [],
    probabilityRegime: [],
  };
  const coverageDiagnostics =
    atlas.coverageDiagnostics
    ?? computeMispricingAtlasCoverageDiagnostics({
      bucketGroups: collectMispricingAtlasBucketGroups({
        probabilityBuckets: atlas.probabilityBuckets,
        timeRemainingBuckets: atlas.timeRemainingBuckets,
        moneynessBuckets: atlas.moneynessBuckets,
        volatilityBuckets: atlas.volatilityBuckets,
        coarseBuckets,
      }),
      sampleCounts: atlas.sampleCounts,
      minSampleThreshold,
    });

  return {
    ...atlas,
    coarseBuckets,
    coverageDiagnostics,
  };
}

export function createEmptyMispricingAtlasCoarseBuckets(): MispricingAtlas["coarseBuckets"] {
  return computeCoarseMispricingBucketSummaries([]);
}
