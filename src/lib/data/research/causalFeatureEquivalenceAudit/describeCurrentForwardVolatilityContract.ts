import type { FrozenHypothesisSpec } from "../calibrationFadeForwardValidation/calibrationFadeForwardValidationTypes";
import {
  CAUSAL_VOLATILITY_WINDOW_CONTRACT_SEMANTICS,
  VOLATILITY_WINDOW_REJECTION_REASONS,
} from "../calibrationFadeForwardValidation/buildValidatedCausalVolatilityWindow";

import type { VolatilityFeatureContract } from "./causalFeatureEquivalenceAuditTypes";

export { VOLATILITY_WINDOW_REJECTION_REASONS, CAUSAL_VOLATILITY_WINDOW_CONTRACT_SEMANTICS };

/**
 * Describes the current forward volatility contract from production semantics:
 * frozen hypothesis volatilityDefinition + buildValidatedCausalVolatilityWindow.
 * Descriptor strings are locked to CAUSAL_VOLATILITY_WINDOW_CONTRACT_SEMANTICS
 * so they cannot drift from the production helper's published contract.
 * Does not modify validator behavior.
 */
export function describeCurrentForwardVolatilityContract(input: {
  spec: FrozenHypothesisSpec;
  maximumBtcJoinAgeMs: number;
}): VolatilityFeatureContract {
  const { spec, maximumBtcJoinAgeMs } = input;
  const lookback = spec.volatilityDefinition.lookbackBars;
  const semantics = CAUSAL_VOLATILITY_WINDOW_CONTRACT_SEMANTICS;

  return {
    sourceInstrument: spec.volatilityDefinition.sourceInstrument,
    sourceRecordType: semantics.sourceRecordType,
    timestampField: semantics.timestampField,
    timestampMeaning: semantics.timestampMeaning,
    returnIntervalMs: spec.volatilityDefinition.returnIntervalMs,
    lookbackReturns: lookback,
    requiredCloseCount: lookback + 1,
    annualizationMethod: spec.volatilityDefinition.method,
    quoteMinuteInclusionPolicy: semantics.quoteMinuteInclusionPolicy,
    missingMinuteBehavior: semantics.missingMinuteBehavior,
    sourceGapDefinition: semantics.sourceGapDefinition,
    sourceGapThresholdMs: spec.volatilityDefinition.maximumSourceGapMs,
    startBoundaryHandling: semantics.startBoundaryHandling,
    internalGapHandling: semantics.internalGapHandling,
    trailingGapHandling: semantics.trailingGapHandling,
    quoteJoinAgeMs: maximumBtcJoinAgeMs,
    quoteJoinAgeRole: semantics.quoteJoinAgeRole,
    duplicateHandling: semantics.duplicateHandling,
    orderingHandling: semantics.orderingHandling,
    invalidPriceHandling: semantics.invalidPriceHandling,
    futureSampleHandling: semantics.futureSampleHandling,
    volHighThreshold: spec.eligibilityRules.volatility.minInclusive,
  };
}
