import {
  collectMispricingAtlasBucketGroups,
  computeMispricingAtlasCoverageDiagnostics,
} from "@/lib/data/research/mispricingAtlas/computeMispricingAtlasCoverage";
import {
  computeCoarseMispricingBucketSummaries,
} from "@/lib/data/research/mispricingAtlas/computeMispricingBucketMetrics";
import { getResearchDimension } from "@/lib/data/research/dimensions";
import type { MispricingAtlas } from "@/lib/data/research/mispricingAtlas/mispricingAtlasTypes";
import type {
  MispricingAtlasBucketSummary,
  MispricingAtlasCoarseBuckets,
  MispricingAtlasCoverageDiagnostics,
} from "@/lib/data/research/mispricingAtlas/mispricingAtlasTypes";

function createEmptyMomentumBucketSummaries(): MispricingAtlasBucketSummary[] {
  return getResearchDimension("momentum15m").getBuckets().map((definition) => ({
    bucketId: definition.bucketId,
    bucketLabel: definition.bucketLabel,
    observations: 0,
    uniqueTradingDays: null,
    averageImpliedProbability: null,
    realizedFrequency: null,
    calibrationError: null,
    brierScore: null,
    averageAbsoluteError: null,
  }));
}

export type NormalizedMispricingAtlas = MispricingAtlas & {
  coarseBuckets: MispricingAtlasCoarseBuckets;
  coverageDiagnostics: MispricingAtlasCoverageDiagnostics;
};

/** Fills coarse bucket shells and coverage when loading legacy atlas artifacts. */
export function normalizeMispricingAtlas(
  atlas: MispricingAtlas,
  minSampleThreshold: number,
): NormalizedMispricingAtlas {
  const source = atlas.coarseBuckets;
  const normalizedCoarseBuckets: MispricingAtlasCoarseBuckets = {
    probabilityOnly: source?.probabilityOnly ?? [],
    probabilityTime: source?.probabilityTime ?? [],
    probabilityRegime: source?.probabilityRegime ?? [],
    probabilityMoneyness: source?.probabilityMoneyness ?? [],
    moneynessTime: source?.moneynessTime ?? [],
    volatilityMoneyness: source?.volatilityMoneyness ?? [],
    volatilityProbabilityTime: source?.volatilityProbabilityTime ?? [],
    probabilityMomentum: source?.probabilityMomentum ?? [],
    momentumTime: source?.momentumTime ?? [],
    momentumVolatility: source?.momentumVolatility ?? [],
    probabilityMomentumTime: source?.probabilityMomentumTime ?? [],
  };
  const coverageDiagnostics =
    atlas.coverageDiagnostics
    ?? computeMispricingAtlasCoverageDiagnostics({
      bucketGroups: collectMispricingAtlasBucketGroups({
        probabilityBuckets: atlas.probabilityBuckets,
        timeRemainingBuckets: atlas.timeRemainingBuckets,
        moneynessBuckets: atlas.moneynessBuckets,
        volatilityBuckets: atlas.volatilityBuckets,
        momentumBuckets: atlas.momentumBuckets ?? createEmptyMomentumBucketSummaries(),
        coarseBuckets: normalizedCoarseBuckets,
      }),
      sampleCounts: atlas.sampleCounts,
      minSampleThreshold,
    });

  return {
    ...atlas,
    momentumBuckets: atlas.momentumBuckets ?? createEmptyMomentumBucketSummaries(),
    coarseBuckets: normalizedCoarseBuckets,
    coverageDiagnostics,
  };
}

export function createEmptyMispricingAtlasCoarseBuckets(): MispricingAtlas["coarseBuckets"] {
  return computeCoarseMispricingBucketSummaries([]);
}
