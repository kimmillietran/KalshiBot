import type { MispricingObservation } from "@/lib/data/research/mispricingAtlas/mispricingAtlasTypes";
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

import { observationMatchesMultiAxisBucket } from "@/lib/data/research/mispricingAtlas/matchMultiAxisBucket";

import type { AtlasCandidateGroupId } from "./parseAtlasCandidateReference";

export type RegimeVolatilityByMarketKey = Map<string, "low" | "medium" | "high">;

function marketJoinKey(observation: MispricingObservation): string {
  return `${observation.strategyId}/${observation.seriesTicker}/${observation.marketTicker}`;
}

/** Returns whether a mispricing observation belongs to an atlas bucket cell. */
export function observationMatchesAtlasBucket(
  groupId: AtlasCandidateGroupId,
  bucketId: string,
  observation: MispricingObservation,
  regimeVolatilityByMarket: RegimeVolatilityByMarketKey = new Map(),
): boolean {
  switch (groupId) {
    case "probabilityOnly": {
      const definition = buildCoarseProbabilityBucketDefinitions().find(
        (entry) => entry.bucketId === bucketId,
      );
      return definition
        ? probabilityFitsBucket(observation.predictedProbability, definition)
        : false;
    }
    case "probability": {
      const definition = buildProbabilityBucketDefinitions().find(
        (entry) => entry.bucketId === bucketId,
      );
      return definition
        ? probabilityFitsBucket(observation.predictedProbability, definition)
        : false;
    }
    case "timeRemaining": {
      const definition = TIME_REMAINING_BUCKET_DEFINITIONS.find(
        (entry) => entry.bucketId === bucketId,
      );
      return (
        definition !== undefined
        && observation.timeRemainingMs !== null
        && valueFitsBucket(observation.timeRemainingMs, definition)
      );
    }
    case "moneyness": {
      const definition = MONEYNESS_BUCKET_DEFINITIONS.find(
        (entry) => entry.bucketId === bucketId,
      );
      return (
        definition !== undefined
        && observation.moneynessPercent !== null
        && valueFitsBucket(observation.moneynessPercent, definition)
      );
    }
    case "volatility": {
      const definition = VOLATILITY_BUCKET_DEFINITIONS.find(
        (entry) => entry.bucketId === bucketId,
      );
      return (
        definition !== undefined
        && observation.annualizedVolatility !== null
        && valueFitsBucket(observation.annualizedVolatility, definition)
      );
    }
    case "probabilityTime": {
      const [probabilityId, timeId] = bucketId.split("-coarse-time-");
      if (!probabilityId || !timeId) {
        return false;
      }

      const probabilityDefinition = buildCoarseProbabilityAxisDefinitions().find(
        (entry) => entry.bucketId === probabilityId,
      );
      const timeDefinition = COARSE_TIME_REMAINING_AXIS_DEFINITIONS.find(
        (entry) => entry.bucketId === `coarse-time-${timeId}`,
      );

      return (
        probabilityDefinition !== undefined
        && timeDefinition !== undefined
        && observation.timeRemainingMs !== null
        && probabilityFitsBucket(observation.predictedProbability, probabilityDefinition)
        && valueFitsBucket(observation.timeRemainingMs, timeDefinition)
      );
    }
    case "probabilityRegime": {
      const [probabilityId, regimeId] = bucketId.split("-coarse-regime-");
      if (!probabilityId || !regimeId) {
        return false;
      }

      const probabilityDefinition = buildCoarseProbabilityAxisDefinitions().find(
        (entry) => entry.bucketId === probabilityId,
      );
      const regimeDefinition = COARSE_VOLATILITY_REGIME_DEFINITIONS.find(
        (entry) => entry.bucketId === `coarse-regime-${regimeId}`,
      );
      const regimeTag = regimeVolatilityByMarket.get(marketJoinKey(observation));

      return (
        probabilityDefinition !== undefined
        && regimeDefinition !== undefined
        && regimeTag === regimeDefinition.regimeTag
        && probabilityFitsBucket(observation.predictedProbability, probabilityDefinition)
      );
    }
    case "probabilityMoneyness":
      return observationMatchesMultiAxisBucket(bucketId, observation, [
        "probability",
        "moneyness",
      ]);
    case "moneynessTime":
      return observationMatchesMultiAxisBucket(bucketId, observation, [
        "moneyness",
        "time",
      ]);
    case "volatilityMoneyness":
      return observationMatchesMultiAxisBucket(bucketId, observation, [
        "volatility",
        "moneyness",
      ]);
    case "volatilityProbabilityTime":
      return observationMatchesMultiAxisBucket(bucketId, observation, [
        "volatility",
        "probability",
        "time",
      ]);
    default:
      return false;
  }
}
