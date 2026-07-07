import {
  TIME_REMAINING_BUCKET_DEFINITIONS,
  valueFitsBucket,
  VOLATILITY_BUCKET_DEFINITIONS,
} from "@/lib/data/research/mispricingAtlas/mispricingAtlasBuckets";
import type { HypothesisRefinementFilters } from "@/lib/data/research/hypothesisRefinementGenerator/hypothesisRefinementTypes";

import type { EnrichedMispricingObservation } from "./hypothesisRobustnessTypes";

const DERIVED_SETTLEMENT_MONTH = "2025-12";

const REFINEMENT_TIME_BUCKET_DEFINITIONS = [
  ...TIME_REMAINING_BUCKET_DEFINITIONS,
  {
    bucketId: "time-5-10m",
    bucketLabel: "5-10 minutes remaining",
    minInclusive: 5 * 60 * 1_000,
    maxExclusive: 10 * 60 * 1_000,
  },
  {
    bucketId: "time-10-15m",
    bucketLabel: "10-15 minutes remaining",
    minInclusive: 10 * 60 * 1_000,
    maxExclusive: 15 * 60 * 1_000,
  },
] as const;

function parseProbabilityRangeLabel(
  label: string,
): { minInclusive: number; maxExclusive: number } | null {
  const match = /\[(\d+(?:\.\d+)?),\s*(\d+(?:\.\d+)?)\)/.exec(label);
  if (!match?.[1] || !match[2]) {
    return null;
  }

  return {
    minInclusive: Number(match[1]),
    maxExclusive: Number(match[2]),
  };
}

/** Narrows parent-bucket observations using M9.42 refinement filter metadata. */
export function applyRefinementSuggestedFilters(
  observations: readonly EnrichedMispricingObservation[],
  filters: HypothesisRefinementFilters,
): EnrichedMispricingObservation[] {
  let filtered = [...observations];

  if (filters.probabilityRangeLabel) {
    const range = parseProbabilityRangeLabel(filters.probabilityRangeLabel);
    if (range) {
      filtered = filtered.filter(
        (observation) =>
          observation.predictedProbability >= range.minInclusive
          && observation.predictedProbability < range.maxExclusive,
      );
    }
  }

  if (filters.timeBucketId) {
    const definition = REFINEMENT_TIME_BUCKET_DEFINITIONS.find(
      (entry) => entry.bucketId === filters.timeBucketId,
    );
    if (definition) {
      filtered = filtered.filter(
        (observation) =>
          observation.timeRemainingMs !== null
          && valueFitsBucket(observation.timeRemainingMs, definition),
      );
    }
  }

  if (filters.volatilityBucketId) {
    const definition = VOLATILITY_BUCKET_DEFINITIONS.find(
      (entry) => entry.bucketId === filters.volatilityBucketId,
    );
    if (definition) {
      filtered = filtered.filter(
        (observation) =>
          observation.annualizedVolatility !== null
          && valueFitsBucket(observation.annualizedVolatility, definition),
      );
    }
  }

  if (filters.excludedMonths && filters.excludedMonths.length > 0) {
    const excluded = new Set(filters.excludedMonths);
    filtered = filtered.filter(
      (observation) =>
        observation.calendarMonth === null || !excluded.has(observation.calendarMonth),
    );
  }

  if (filters.includedMonths && filters.includedMonths.length > 0) {
    const included = new Set(filters.includedMonths);
    filtered = filtered.filter(
      (observation) =>
        observation.calendarMonth !== null && included.has(observation.calendarMonth),
    );
  }

  if (filters.settlementMode === "official-only") {
    filtered = filtered.filter(
      (observation) => observation.calendarMonth !== DERIVED_SETTLEMENT_MONTH,
    );
  }

  return filtered;
}
