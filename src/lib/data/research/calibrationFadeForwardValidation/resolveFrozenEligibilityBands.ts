import {
  buildCoarseProbabilityAxisDefinitions,
  COARSE_TIME_REMAINING_AXIS_DEFINITIONS,
  VOLATILITY_BUCKET_DEFINITIONS,
} from "@/lib/data/research/dimensions";
import type { MispricingObservation } from "@/lib/data/research/mispricingAtlas/mispricingAtlasTypes";

import {
  CalibrationFadeForwardValidationError,
  type FrozenHypothesisSpec,
} from "./calibrationFadeForwardValidationTypes";

export type ResolvedFrozenEligibilityBands = {
  volatility: { bucketId: string; minInclusive: number; maxExclusive: number | null };
  probability: { bucketId: string; minInclusive: number; maxExclusive: number };
  timeRemainingMs: { bucketId: string; minInclusive: number; maxExclusive: number };
};

/**
 * Architecture B: resolve registered coarse-prob-1 (and peer) bounds, then verify
 * the frozen config mirrors them exactly. Fail closed on disagreement.
 */
export function resolveFrozenEligibilityBands(
  spec: FrozenHypothesisSpec,
): ResolvedFrozenEligibilityBands {
  const probabilityRegistered = buildCoarseProbabilityAxisDefinitions().find(
    (entry) => entry.bucketId === spec.eligibilityRules.probability.bucketId,
  );
  if (!probabilityRegistered || probabilityRegistered.maxExclusive === null) {
    throw new CalibrationFadeForwardValidationError(
      `Unknown or open-ended probability bucket ${spec.eligibilityRules.probability.bucketId}.`,
    );
  }
  if (
    spec.eligibilityRules.probability.minInclusive !== probabilityRegistered.minInclusive
    || spec.eligibilityRules.probability.maxExclusive !== probabilityRegistered.maxExclusive
  ) {
    throw new CalibrationFadeForwardValidationError(
      `Probability bounds disagree with registered bucket ${probabilityRegistered.bucketId}: `
        + `config [${spec.eligibilityRules.probability.minInclusive}, ${spec.eligibilityRules.probability.maxExclusive}) `
        + `vs registry [${probabilityRegistered.minInclusive}, ${probabilityRegistered.maxExclusive}).`,
    );
  }

  const volatilityRegistered = VOLATILITY_BUCKET_DEFINITIONS.find(
    (entry) => entry.bucketId === spec.eligibilityRules.volatility.bucketId,
  );
  if (!volatilityRegistered) {
    throw new CalibrationFadeForwardValidationError(
      `Unknown volatility bucket ${spec.eligibilityRules.volatility.bucketId}.`,
    );
  }
  if (
    spec.eligibilityRules.volatility.minInclusive !== volatilityRegistered.minInclusive
    || spec.eligibilityRules.volatility.maxExclusive !== volatilityRegistered.maxExclusive
  ) {
    throw new CalibrationFadeForwardValidationError(
      `Volatility bounds disagree with registered bucket ${volatilityRegistered.bucketId}.`,
    );
  }

  const timeRegistered = COARSE_TIME_REMAINING_AXIS_DEFINITIONS.find(
    (entry) => entry.bucketId === spec.eligibilityRules.timeRemainingMs.bucketId,
  );
  if (!timeRegistered || timeRegistered.maxExclusive === null) {
    throw new CalibrationFadeForwardValidationError(
      `Unknown or open-ended time-remaining bucket ${spec.eligibilityRules.timeRemainingMs.bucketId}.`,
    );
  }
  if (
    spec.eligibilityRules.timeRemainingMs.minInclusive !== timeRegistered.minInclusive
    || spec.eligibilityRules.timeRemainingMs.maxExclusive !== timeRegistered.maxExclusive
  ) {
    throw new CalibrationFadeForwardValidationError(
      `Time-remaining bounds disagree with registered bucket ${timeRegistered.bucketId}.`,
    );
  }

  return {
    volatility: {
      bucketId: volatilityRegistered.bucketId,
      minInclusive: volatilityRegistered.minInclusive,
      maxExclusive: volatilityRegistered.maxExclusive,
    },
    probability: {
      bucketId: probabilityRegistered.bucketId,
      minInclusive: probabilityRegistered.minInclusive,
      maxExclusive: probabilityRegistered.maxExclusive,
    },
    timeRemainingMs: {
      bucketId: timeRegistered.bucketId,
      minInclusive: timeRegistered.minInclusive,
      maxExclusive: timeRegistered.maxExclusive,
    },
  };
}

export function probabilityInAuthoritativeBand(
  probability: number,
  band: ResolvedFrozenEligibilityBands["probability"],
): boolean {
  return probability >= band.minInclusive && probability < band.maxExclusive;
}

export function volatilityInAuthoritativeBand(
  annualizedVolatility: number,
  band: ResolvedFrozenEligibilityBands["volatility"],
): boolean {
  if (annualizedVolatility < band.minInclusive) {
    return false;
  }
  if (band.maxExclusive === null) {
    return true;
  }
  return annualizedVolatility < band.maxExclusive;
}

export function timeRemainingInAuthoritativeBand(
  timeRemainingMs: number,
  band: ResolvedFrozenEligibilityBands["timeRemainingMs"],
): boolean {
  return timeRemainingMs >= band.minInclusive && timeRemainingMs < band.maxExclusive;
}

/** Single eligibility predicate for funnel, gates, qualifies, episodes, and events. */
export function observationMeetsFrozenEligibility(input: {
  observation: MispricingObservation;
  bands: ResolvedFrozenEligibilityBands;
}): boolean {
  const { observation, bands } = input;
  if (observation.annualizedVolatility === null) {
    return false;
  }
  if (!volatilityInAuthoritativeBand(observation.annualizedVolatility, bands.volatility)) {
    return false;
  }
  if (!probabilityInAuthoritativeBand(observation.predictedProbability, bands.probability)) {
    return false;
  }
  if (observation.timeRemainingMs === null) {
    return false;
  }
  return timeRemainingInAuthoritativeBand(observation.timeRemainingMs, bands.timeRemainingMs);
}
