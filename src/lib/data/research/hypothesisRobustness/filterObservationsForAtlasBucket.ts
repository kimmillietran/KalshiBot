import {
  buildCoarseProbabilityAxisDefinitions,
  buildCoarseProbabilityBucketDefinitions,
  buildProbabilityBucketDefinitions,
  COARSE_TIME_REMAINING_AXIS_DEFINITIONS,
  COARSE_VOLATILITY_REGIME_DEFINITIONS,
  MONEYNESS_BUCKET_DEFINITIONS,
  probabilityFitsBucket,
  TIME_REMAINING_BUCKET_DEFINITIONS,
  valueFitsBucket,
  VOLATILITY_BUCKET_DEFINITIONS,
} from "@/lib/data/research/mispricingAtlas/mispricingAtlasBuckets";
import type { RegimeVolatilityByMarketKey } from "@/lib/data/research/mispricingAtlas/mispricingAtlasTypes";

import { observationMatchesMultiAxisBucket } from "@/lib/data/research/mispricingAtlas/matchMultiAxisBucket";

import type {
  EnrichedMispricingObservation,
  ParsedAtlasHypothesisRef,
} from "./hypothesisRobustnessTypes";

function marketJoinKey(observation: EnrichedMispricingObservation): string {
  return `${observation.strategyId}/${observation.seriesTicker}/${observation.marketTicker}`;
}

function findDefinition<T extends { bucketId: string }>(
  definitions: readonly T[],
  bucketId: string,
): T | undefined {
  return definitions.find((definition) => definition.bucketId === bucketId);
}

/** Filters enriched observations to those matching an atlas hypothesis bucket. */
export function filterObservationsForAtlasBucket(
  observations: readonly EnrichedMispricingObservation[],
  ref: ParsedAtlasHypothesisRef,
  regimeVolatilityByMarket: RegimeVolatilityByMarketKey,
): EnrichedMispricingObservation[] {
  switch (ref.groupId) {
    case "probability": {
      const definition = findDefinition(buildProbabilityBucketDefinitions(), ref.bucketId);
      if (!definition) {
        return [];
      }

      return observations.filter((observation) =>
        probabilityFitsBucket(observation.predictedProbability, definition),
      );
    }
    case "probabilityOnly": {
      const definition = findDefinition(
        buildCoarseProbabilityBucketDefinitions(),
        ref.bucketId,
      );
      if (!definition) {
        return [];
      }

      return observations.filter((observation) =>
        probabilityFitsBucket(observation.predictedProbability, definition),
      );
    }
    case "probabilityTime": {
      for (const probabilityDefinition of buildCoarseProbabilityAxisDefinitions()) {
        for (const timeDefinition of COARSE_TIME_REMAINING_AXIS_DEFINITIONS) {
          const compositeId = `${probabilityDefinition.bucketId}-${timeDefinition.bucketId}`;
          if (compositeId !== ref.bucketId) {
            continue;
          }

          return observations.filter((observation) => {
            if (observation.timeRemainingMs === null) {
              return false;
            }

            return (
              probabilityFitsBucket(observation.predictedProbability, probabilityDefinition)
              && valueFitsBucket(observation.timeRemainingMs, timeDefinition)
            );
          });
        }
      }

      return [];
    }
    case "probabilityRegime": {
      for (const probabilityDefinition of buildCoarseProbabilityAxisDefinitions()) {
        for (const regimeDefinition of COARSE_VOLATILITY_REGIME_DEFINITIONS) {
          const compositeId = `${probabilityDefinition.bucketId}-${regimeDefinition.bucketId}`;
          if (compositeId !== ref.bucketId) {
            continue;
          }

          return observations.filter((observation) => {
            const regimeTag = regimeVolatilityByMarket.get(marketJoinKey(observation));
            if (regimeTag !== regimeDefinition.regimeTag) {
              return false;
            }

            return probabilityFitsBucket(
              observation.predictedProbability,
              probabilityDefinition,
            );
          });
        }
      }

      return [];
    }
    case "probabilityMoneyness":
      return observations.filter((observation) =>
        observationMatchesMultiAxisBucket(ref.bucketId, observation, [
          "probability",
          "moneyness",
        ]),
      );
    case "moneynessTime":
      return observations.filter((observation) =>
        observationMatchesMultiAxisBucket(ref.bucketId, observation, [
          "moneyness",
          "time",
        ]),
      );
    case "volatilityMoneyness":
      return observations.filter((observation) =>
        observationMatchesMultiAxisBucket(ref.bucketId, observation, [
          "volatility",
          "moneyness",
        ]),
      );
    case "volatilityProbabilityTime":
      return observations.filter((observation) =>
        observationMatchesMultiAxisBucket(ref.bucketId, observation, [
          "volatility",
          "probability",
          "time",
        ]),
      );
    case "timeRemaining": {
      const definition = findDefinition(TIME_REMAINING_BUCKET_DEFINITIONS, ref.bucketId);
      if (!definition) {
        return [];
      }

      return observations.filter(
        (observation) =>
          observation.timeRemainingMs !== null
          && valueFitsBucket(observation.timeRemainingMs, definition),
      );
    }
    case "moneyness": {
      const definition = findDefinition(MONEYNESS_BUCKET_DEFINITIONS, ref.bucketId);
      if (!definition) {
        return [];
      }

      return observations.filter(
        (observation) =>
          observation.moneynessPercent !== null
          && valueFitsBucket(observation.moneynessPercent, definition),
      );
    }
    case "volatility": {
      const definition = findDefinition(VOLATILITY_BUCKET_DEFINITIONS, ref.bucketId);
      if (!definition) {
        return [];
      }

      return observations.filter(
        (observation) =>
          observation.annualizedVolatility !== null
          && valueFitsBucket(observation.annualizedVolatility, definition),
      );
    }
    default:
      return [];
  }
}
