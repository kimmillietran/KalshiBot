import type { MispricingObservation } from "@/lib/data/research/mispricingAtlas/mispricingAtlasTypes";

import {
  buildCoarseProbabilityAxisDefinitions,
  COARSE_TIME_REMAINING_AXIS_DEFINITIONS,
  MONEYNESS_BUCKET_DEFINITIONS,
  probabilityFitsBucket,
  valueFitsBucket,
  VOLATILITY_BUCKET_DEFINITIONS,
} from "./bucketDefinitions";
import { MOMENTUM_BUCKET_DEFINITIONS } from "./momentum/momentumBucketDefinitions";
import {
  DAY_OF_WEEK_UTC_BUCKET_DEFINITIONS,
  HOUR_UTC_BUCKET_DEFINITIONS,
  SESSION_BUCKET_DEFINITIONS,
  WEEKEND_FLAG_BUCKET_DEFINITIONS,
} from "./temporalBucketDefinitions";
import { extractDimensionValue } from "./extractors";
import { getResearchDimension, MATCHER_AXIS_TO_DIMENSION_ID } from "./registry";
import type {
  NumericBucketDefinition,
  ResearchDimensionId,
  ResearchMatcherAxisId,
} from "./types";

export type ParsedMultiAxisBucketParts = {
  probabilityBucketId: string | null;
  timeBucketId: string | null;
  moneynessBucketId: string | null;
  volatilityBucketId: string | null;
  momentumBucketId: string | null;
  hourBucketId: string | null;
  dayOfWeekBucketId: string | null;
  sessionBucketId: string | null;
  weekendBucketId: string | null;
};

const NULL_TEMPORAL_AXIS_PARTS = {
  hourBucketId: null,
  dayOfWeekBucketId: null,
  sessionBucketId: null,
  weekendBucketId: null,
} as const satisfies Pick<
  ParsedMultiAxisBucketParts,
  "hourBucketId" | "dayOfWeekBucketId" | "sessionBucketId" | "weekendBucketId"
>;

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

function findMomentumBucketId(bucketId: string): string | null {
  const match = MOMENTUM_BUCKET_DEFINITIONS.find((definition) =>
    bucketId.includes(definition.bucketId),
  );
  return match?.bucketId ?? null;
}

function findHourBucketId(bucketId: string): string | null {
  const match = HOUR_UTC_BUCKET_DEFINITIONS.find((definition) =>
    bucketId.includes(definition.bucketId),
  );
  return match?.bucketId ?? null;
}

function findDayOfWeekBucketId(bucketId: string): string | null {
  const match = DAY_OF_WEEK_UTC_BUCKET_DEFINITIONS.find((definition) =>
    bucketId.includes(definition.bucketId),
  );
  return match?.bucketId ?? null;
}

function findSessionBucketId(bucketId: string): string | null {
  const match = SESSION_BUCKET_DEFINITIONS.find((definition) =>
    bucketId.includes(definition.bucketId),
  );
  return match?.bucketId ?? null;
}

function findWeekendBucketId(bucketId: string): string | null {
  const match = WEEKEND_FLAG_BUCKET_DEFINITIONS.find((definition) =>
    bucketId.includes(definition.bucketId),
  );
  return match?.bucketId ?? null;
}

/** Parses composite bucket ids for multi-axis atlas cells. */
export function parseMultiAxisBucketId(bucketId: string): ParsedMultiAxisBucketParts {
  const probabilityMomentumTimeMatch =
    /^(coarse-prob-\d+)-(momentum-(?:strong-down|moderate-down|flat|moderate-up|strong-up))-(coarse-time-(?:early|late))$/.exec(
      bucketId,
    );
  if (probabilityMomentumTimeMatch) {
    return {
      probabilityBucketId: probabilityMomentumTimeMatch[1] ?? null,
      momentumBucketId: probabilityMomentumTimeMatch[2] ?? null,
      timeBucketId: probabilityMomentumTimeMatch[3] ?? null,
      moneynessBucketId: null,
      volatilityBucketId: null,
      ...NULL_TEMPORAL_AXIS_PARTS,
    };
  }

  const momentumVolatilityMatch =
    /^(vol-(?:low|medium|high))-(momentum-(?:strong-down|moderate-down|flat|moderate-up|strong-up))$/.exec(
      bucketId,
    );
  if (momentumVolatilityMatch) {
    return {
      volatilityBucketId: momentumVolatilityMatch[1] ?? null,
      momentumBucketId: momentumVolatilityMatch[2] ?? null,
      probabilityBucketId: null,
      timeBucketId: null,
      moneynessBucketId: null,
      ...NULL_TEMPORAL_AXIS_PARTS,
    };
  }

  const probabilityMomentumMatch =
    /^(coarse-prob-\d+)-(momentum-(?:strong-down|moderate-down|flat|moderate-up|strong-up))$/.exec(
      bucketId,
    );
  if (probabilityMomentumMatch) {
    return {
      probabilityBucketId: probabilityMomentumMatch[1] ?? null,
      momentumBucketId: probabilityMomentumMatch[2] ?? null,
      timeBucketId: null,
      moneynessBucketId: null,
      volatilityBucketId: null,
      ...NULL_TEMPORAL_AXIS_PARTS,
    };
  }

  const momentumTimeMatch =
    /^(momentum-(?:strong-down|moderate-down|flat|moderate-up|strong-up))-(coarse-time-(?:early|late))$/.exec(
      bucketId,
    );
  if (momentumTimeMatch) {
    return {
      momentumBucketId: momentumTimeMatch[1] ?? null,
      timeBucketId: momentumTimeMatch[2] ?? null,
      probabilityBucketId: null,
      moneynessBucketId: null,
      volatilityBucketId: null,
      ...NULL_TEMPORAL_AXIS_PARTS,
    };
  }

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
      momentumBucketId: null,
      ...NULL_TEMPORAL_AXIS_PARTS,
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
      momentumBucketId: null,
      ...NULL_TEMPORAL_AXIS_PARTS,
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
      momentumBucketId: null,
      ...NULL_TEMPORAL_AXIS_PARTS,
    };
  }

  const moneynessTimeMatch = /^(moneyness-.+)-(time-.+)$/.exec(bucketId);
  if (moneynessTimeMatch) {
    return {
      moneynessBucketId: moneynessTimeMatch[1] ?? null,
      timeBucketId: moneynessTimeMatch[2] ?? null,
      probabilityBucketId: null,
      volatilityBucketId: null,
      momentumBucketId: null,
      ...NULL_TEMPORAL_AXIS_PARTS,
    };
  }

  return {
    probabilityBucketId: findCoarseProbabilityBucketId(bucketId),
    timeBucketId: findCoarseTimeBucketId(bucketId),
    moneynessBucketId: findMoneynessBucketId(bucketId),
    volatilityBucketId: findVolatilityBucketId(bucketId),
    momentumBucketId: findMomentumBucketId(bucketId),
    hourBucketId: findHourBucketId(bucketId),
    dayOfWeekBucketId: findDayOfWeekBucketId(bucketId),
    sessionBucketId: findSessionBucketId(bucketId),
    weekendBucketId: findWeekendBucketId(bucketId),
  };
}

function findBucketDefinition(
  dimensionId: ResearchDimensionId,
  bucketId: string,
): NumericBucketDefinition | undefined {
  return getResearchDimension(dimensionId)
    .getBuckets()
    .find((entry) => entry.bucketId === bucketId);
}

function observationMatchesMatcherAxis(
  observation: MispricingObservation,
  axis: ResearchMatcherAxisId,
  bucketId: string | null,
): boolean {
  if (!bucketId) {
    return true;
  }

  const dimensionId = MATCHER_AXIS_TO_DIMENSION_ID[axis];
  const dimension = getResearchDimension(dimensionId);
  const value = dimension.extractValue(observation);

  if (axis === "time") {
    const coarseDefinition = findBucketDefinition("coarseTimeRemaining", bucketId);
    if (coarseDefinition) {
      return value !== null && dimension.valueFitsBucket(value, coarseDefinition);
    }

    const fineDefinition = findBucketDefinition("timeRemaining", bucketId);
    return (
      fineDefinition !== undefined
      && value !== null
      && dimension.valueFitsBucket(value, fineDefinition)
    );
  }

  const definition = findBucketDefinition(dimensionId, bucketId);
  return (
    definition !== undefined
    && value !== null
    && dimension.valueFitsBucket(value, definition)
  );
}

/** Returns whether an observation belongs to a multi-axis bucket cell. */
export function observationMatchesMultiAxisBucket(
  bucketId: string,
  observation: MispricingObservation,
  axes: readonly ResearchMatcherAxisId[],
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
            : axis === "momentum"
              ? parts.momentumBucketId
              : axis === "hour"
                ? parts.hourBucketId
                : axis === "dayOfWeek"
                  ? parts.dayOfWeekBucketId
                  : axis === "session"
                    ? parts.sessionBucketId
                    : axis === "weekend"
                      ? parts.weekendBucketId
                      : parts.volatilityBucketId;

    return observationMatchesMatcherAxis(observation, axis, axisBucketId);
  });
}

/** Returns whether an observation value fits a single-dimension bucket. */
export function observationMatchesSingleDimensionBucket(
  dimensionId: ResearchDimensionId,
  bucketId: string,
  observation: MispricingObservation,
): boolean {
  const dimension = getResearchDimension(dimensionId);
  const definition = findBucketDefinition(dimensionId, bucketId);
  if (!definition) {
    return false;
  }

  const value = dimension.extractValue(observation);
  return value !== null && dimension.valueFitsBucket(value, definition);
}

/** Builds a composite bucket id label from participating dimension bucket defs. */
export function buildCompositeBucketIdentity(
  dimensionIds: readonly ResearchDimensionId[],
  bucketDefinitions: readonly NumericBucketDefinition[],
): { bucketId: string; bucketLabel: string } {
  const bucketId = bucketDefinitions.map((definition) => definition.bucketId).join("-");
  const bucketLabel = bucketDefinitions
    .map((definition) => definition.bucketLabel)
    .join(" × ");

  if (dimensionIds.length !== bucketDefinitions.length) {
    throw new Error("Dimension and bucket definition counts must match.");
  }

  return { bucketId, bucketLabel };
}

/** Returns whether an observation matches all dimension buckets in order. */
export function observationMatchesDimensionBuckets(
  observation: MispricingObservation,
  dimensionIds: readonly ResearchDimensionId[],
  bucketDefinitions: readonly NumericBucketDefinition[],
): boolean {
  return dimensionIds.every((dimensionId, index) => {
    const definition = bucketDefinitions[index];
    if (!definition) {
      return false;
    }

    const value = extractDimensionValue(dimensionId, observation);
    if (value === null) {
      return false;
    }

    const dimension = getResearchDimension(dimensionId);
    return dimension.valueFitsBucket(value, definition);
  });
}

export {
  probabilityFitsBucket,
  valueFitsBucket,
};
