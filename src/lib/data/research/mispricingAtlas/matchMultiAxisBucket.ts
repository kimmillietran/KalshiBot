import {
  buildCoarseProbabilityAxisDefinitions,
  MONEYNESS_BUCKET_DEFINITIONS,
  probabilityFitsBucket,
  TIME_REMAINING_BUCKET_DEFINITIONS,
  valueFitsBucket,
  VOLATILITY_BUCKET_DEFINITIONS,
} from "./mispricingAtlasBuckets";
import { COARSE_TIME_REMAINING_AXIS_DEFINITIONS } from "./mispricingAtlasBuckets";
import type { MispricingObservation } from "./mispricingAtlasTypes";

export type ParsedMultiAxisBucketParts = {
  probabilityBucketId: string | null;
  timeBucketId: string | null;
  moneynessBucketId: string | null;
  volatilityBucketId: string | null;
};

function findMoneynessBucketId(bucketId: string): string | null {
  const match = MONEYNESS_BUCKET_DEFINITIONS.find((definition) =>
    bucketId.includes(definition.bucketId),
  );
  return match?.bucketId ?? null;
}

function findCoarseTimeBucketId(bucketId: string): string | null {
  const match = COARSE_TIME_REMAINING_AXIS_DEFINITIONS.find((definition) =>
    bucketId.includes(definition.bucketId),
  );
  return match?.bucketId ?? null;
}

function findVolatilityBucketId(bucketId: string): string | null {
  const match = VOLATILITY_BUCKET_DEFINITIONS.find((definition) =>
    bucketId.startsWith(definition.bucketId),
  );
  return match?.bucketId ?? null;
}

function findCoarseProbabilityBucketId(bucketId: string): string | null {
  const match = buildCoarseProbabilityAxisDefinitions().find((definition) =>
    bucketId.includes(definition.bucketId),
  );
  return match?.bucketId ?? null;
}

/** Parses composite bucket ids for multi-axis atlas cells. */
export function parseMultiAxisBucketId(bucketId: string): ParsedMultiAxisBucketParts {
  const volatilityProbabilityTimeMatch =
    /^(vol-(?:low|medium|high))-(coarse-prob-\d+)-(coarse-time-(?:early|late))$/.exec(
      bucketId,
    );
  if (volatilityProbabilityTimeMatch) {
    return {
      volatilityBucketId: volatilityProbabilityTimeMatch[1] ?? null,
      probabilityBucketId: volatilityProbabilityTimeMatch[2] ?? null,
      timeBucketId: volatilityProbabilityTimeMatch[3] ?? null,
      moneynessBucketId: null,
    };
  }

  const volatilityMoneynessMatch =
    /^(vol-(?:low|medium|high))-(moneyness-.+)$/.exec(bucketId);
  if (volatilityMoneynessMatch) {
    return {
      volatilityBucketId: volatilityMoneynessMatch[1] ?? null,
      moneynessBucketId: volatilityMoneynessMatch[2] ?? null,
      probabilityBucketId: null,
      timeBucketId: null,
    };
  }

  const probabilityMoneynessMatch =
    /^(coarse-prob-\d+)-(moneyness-.+)$/.exec(bucketId);
  if (probabilityMoneynessMatch) {
    return {
      probabilityBucketId: probabilityMoneynessMatch[1] ?? null,
      moneynessBucketId: probabilityMoneynessMatch[2] ?? null,
      timeBucketId: null,
      volatilityBucketId: null,
    };
  }

  const moneynessTimeMatch = /^(moneyness-.+)-(time-.+)$/.exec(bucketId);
  if (moneynessTimeMatch) {
    return {
      moneynessBucketId: moneynessTimeMatch[1] ?? null,
      timeBucketId: moneynessTimeMatch[2] ?? null,
      probabilityBucketId: null,
      volatilityBucketId: null,
    };
  }

  return {
    probabilityBucketId: findCoarseProbabilityBucketId(bucketId),
    timeBucketId: findCoarseTimeBucketId(bucketId),
    moneynessBucketId: findMoneynessBucketId(bucketId),
    volatilityBucketId: findVolatilityBucketId(bucketId),
  };
}

function observationMatchesAxis(
  observation: MispricingObservation,
  axis: "probability" | "time" | "moneyness" | "volatility",
  bucketId: string | null,
): boolean {
  if (!bucketId) {
    return true;
  }

  switch (axis) {
    case "probability": {
      const definition = buildCoarseProbabilityAxisDefinitions().find(
        (entry) => entry.bucketId === bucketId,
      );
      return definition
        ? probabilityFitsBucket(observation.predictedProbability, definition)
        : false;
    }
    case "time": {
      const coarseDefinition = COARSE_TIME_REMAINING_AXIS_DEFINITIONS.find(
        (entry) => entry.bucketId === bucketId,
      );
      if (coarseDefinition) {
        return (
          observation.timeRemainingMs !== null
          && valueFitsBucket(observation.timeRemainingMs, coarseDefinition)
        );
      }

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
    default:
      return false;
  }
}

/** Returns whether an observation belongs to a multi-axis bucket cell. */
export function observationMatchesMultiAxisBucket(
  bucketId: string,
  observation: MispricingObservation,
  axes: readonly ("probability" | "time" | "moneyness" | "volatility")[],
): boolean {
  const parts = parseMultiAxisBucketId(bucketId);

  return axes.every((axis) => {
    const axisBucketId =
      axis === "probability"
        ? parts.probabilityBucketId
        : axis === "time"
          ? parts.timeBucketId
          : axis === "moneyness"
            ? parts.moneynessBucketId
            : parts.volatilityBucketId;

    return observationMatchesAxis(observation, axis, axisBucketId);
  });
}
