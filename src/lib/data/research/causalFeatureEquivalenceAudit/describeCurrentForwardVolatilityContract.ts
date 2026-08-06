import type { FrozenHypothesisSpec } from "../calibrationFadeForwardValidation/calibrationFadeForwardValidationTypes";
import { VOLATILITY_WINDOW_REJECTION_REASONS } from "../calibrationFadeForwardValidation/buildValidatedCausalVolatilityWindow";

import type { VolatilityFeatureContract } from "./causalFeatureEquivalenceAuditTypes";

export { VOLATILITY_WINDOW_REJECTION_REASONS };

/**
 * Describes the current forward volatility contract from production semantics:
 * frozen hypothesis volatilityDefinition + buildValidatedCausalVolatilityWindow.
 * Does not modify validator behavior.
 */
export function describeCurrentForwardVolatilityContract(input: {
  spec: FrozenHypothesisSpec;
  maximumBtcJoinAgeMs: number;
}): VolatilityFeatureContract {
  const { spec, maximumBtcJoinAgeMs } = input;
  const lookback = spec.volatilityDefinition.lookbackBars;

  return {
    sourceInstrument: spec.volatilityDefinition.sourceInstrument,
    sourceRecordType: "btc-spot-jsonl-points",
    timestampField: "exchangeTimestampMs??receivedAtMs",
    timestampMeaning: "exchange-preferred-else-received-at-local",
    returnIntervalMs: spec.volatilityDefinition.returnIntervalMs,
    lookbackReturns: lookback,
    requiredCloseCount: lookback + 1,
    annualizationMethod: spec.volatilityDefinition.method,
    quoteMinuteInclusionPolicy: "include-in-progress-minute-when-sampled",
    missingMinuteBehavior: "reject-missing-minute-bucket-no-fill",
    sourceGapDefinition:
      "adjacent-source-points-including-start-boundary-internal-and-trailing-to-quote",
    sourceGapThresholdMs: spec.volatilityDefinition.maximumSourceGapMs,
    startBoundaryHandling:
      "predecessor-or-window-start-to-first-selected-point-must-be-within-maximumSourceGapMs",
    internalGapHandling: "adjacent-selected-source-gaps-must-be-within-maximumSourceGapMs",
    trailingGapHandling: "last-selected-source-to-quote-must-be-within-maximumSourceGapMs",
    quoteJoinAgeMs: maximumBtcJoinAgeMs,
    quoteJoinAgeRole: "spot-join-staleness-gate-not-vol-source-gap",
    duplicateHandling: "exact-timestamp-price-collapse-conflicting-price-reject",
    orderingHandling: "reject-non-ascending-input-no-resort",
    invalidPriceHandling: "reject-non-finite-or-non-positive-in-window-scope",
    futureSampleHandling: "exclude-points-after-quote-never-used",
    volHighThreshold: spec.eligibilityRules.volatility.minInclusive,
  };
}
