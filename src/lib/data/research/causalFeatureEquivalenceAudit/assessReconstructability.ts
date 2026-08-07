import { safeShare } from "../calibrationFadeForwardValidation/calibrationFadeForwardValidationUtils";

import {
  RECONSTRUCTABILITY_DENOMINATOR_DEFINITION,
  type ReconstructabilityAssessment,
  type StructuralExclusionReason,
  type VolatilityWindowAttributionClass,
  type VolatilityWindowAttributionObservation,
  type VolatilityWindowDiagnostics,
} from "./causalFeatureEquivalenceAuditTypes";

/** Attribution classes that can reflect insufficient causal history at a quote. */
const HISTORY_INSUFFICIENCY_CLASSES = new Set<VolatilityWindowAttributionClass>([
  "insufficient-bars",
  "insufficient-source-points",
  "future-only-source",
]);

const CONTINUITY_FAILURE_CLASSES = new Set<VolatilityWindowAttributionClass>([
  "start-boundary-gap-exceeded",
  "internal-source-gap-exceeded",
  "trailing-source-age-exceeded",
]);

/**
 * Derives the earliest quote timestamp at which production candle semantics could
 * possibly yield `requiredCloseCount` consecutive minute buckets.
 *
 * Derivation (locked to buildValidatedCausalVolatilityWindow):
 * 1. First usable causal BTC sample timestamp F (finite, positive price).
 * 2. First candle bucket B0 = floor(F / returnIntervalMs) * returnIntervalMs
 *    (minute alignment; a mid-minute first sample still opens bucket B0).
 * 3. requiredCloseCount = lookbackBars + 1 consecutive no-fill buckets.
 * 4. With include-in-progress-minute-when-sampled, the earliest complete window
 *    ends at Wend = B0 + (requiredCloseCount - 1) * returnIntervalMs.
 * 5. A quote at exactly Wend can include that ending in-progress minute when a
 *    causal sample exists in [Wend, Wend + returnIntervalMs) under healthy
 *    continuity — matching production acceptance of quote===Wend with dense history.
 *
 * Therefore:
 *   earliestFeatureEvaluableTimestampMs = B0 + (requiredCloseCount - 1) * returnIntervalMs
 *
 * This equals F + lookbackBars * returnIntervalMs only when F is already aligned to
 * B0; mid-minute first samples must not use a naive F+10min rule.
 */
export function deriveEarliestFeatureEvaluableTimestampMs(input: {
  firstUsableCausalBtcTimestampMs: number | null;
  returnIntervalMs: number;
  requiredCloseCount: number;
}): number | null {
  const { firstUsableCausalBtcTimestampMs, returnIntervalMs, requiredCloseCount } = input;
  if (
    firstUsableCausalBtcTimestampMs === null
    || !Number.isFinite(firstUsableCausalBtcTimestampMs)
    || !Number.isSafeInteger(returnIntervalMs)
    || returnIntervalMs <= 0
    || !Number.isSafeInteger(requiredCloseCount)
    || requiredCloseCount < 2
  ) {
    return null;
  }
  const firstBucketStart =
    Math.floor(firstUsableCausalBtcTimestampMs / returnIntervalMs) * returnIntervalMs;
  return firstBucketStart + (requiredCloseCount - 1) * returnIntervalMs;
}

/** Earliest finite positive-price BTC timestamp (O(M), single pass). */
export function findFirstUsableCausalBtcTimestampMs(
  points: readonly { timestampMs: number; priceUsd: number }[],
): number | null {
  let earliest: number | null = null;
  for (const point of points) {
    if (!Number.isFinite(point.timestampMs) || !Number.isFinite(point.priceUsd) || point.priceUsd <= 0) {
      continue;
    }
    if (earliest === null || point.timestampMs < earliest) {
      earliest = point.timestampMs;
    }
  }
  return earliest;
}

/**
 * Structural exclusion is NOT inferred from the rejection reason alone.
 * Timestamp is compared to run-relative boundaries; only history-insufficiency
 * failures before those boundaries may be excluded.
 */
export function classifyStructuralExclusion(input: {
  observation: VolatilityWindowAttributionObservation;
  firstUsableCausalBtcTimestampMs: number | null;
  earliestFeatureEvaluableTimestampMs: number | null;
}): StructuralExclusionReason | null {
  const { observation, firstUsableCausalBtcTimestampMs, earliestFeatureEvaluableTimestampMs } =
    input;
  if (observation.attributionClass === "available") {
    return null;
  }

  // Before any usable causal BTC exists for this quote: structural pre-source.
  if (
    firstUsableCausalBtcTimestampMs === null
    || observation.timestampMs < firstUsableCausalBtcTimestampMs
  ) {
    if (HISTORY_INSUFFICIENCY_CLASSES.has(observation.attributionClass)) {
      return "pre-first-causal-source";
    }
    return null;
  }

  // Finite-run warm-up: before the feature could possibly have enough history.
  if (
    earliestFeatureEvaluableTimestampMs !== null
    && observation.timestampMs < earliestFeatureEvaluableTimestampMs
    && HISTORY_INSUFFICIENCY_CLASSES.has(observation.attributionClass)
  ) {
    return "feature-warmup-insufficient-history";
  }

  // At/after earliestFeatureEvaluableTimestampMs: insufficient-bars /
  // insufficient-source-points / future-only are real reconstruction failures.
  return null;
}

function emptyStructuralCounts(): Partial<Record<StructuralExclusionReason, number>> {
  return {};
}

function emptyFailureCounts(): Partial<Record<VolatilityWindowAttributionClass, number>> {
  return {};
}

/**
 * Reconstructability uses Domain A feature-evaluable denominator:
 * observedTotal − structurallyExcluded.
 *
 * reconstructable =
 *   featureEvaluableCount > 0
 *   && availableCount === featureEvaluableCount
 *   && reconstructionFailureCount === 0
 *
 * Ambiguity / contract inequivalence still force reconstructable=false and take
 * verdict precedence outside this helper.
 */
export function assessReconstructability(
  volatilityWindowDiagnostics: VolatilityWindowDiagnostics,
  contractEquivalent: boolean,
  historicalAmbiguous: boolean,
  options: {
    firstUsableCausalBtcTimestampMs: number | null;
    returnIntervalMs: number;
    requiredCloseCount: number;
  },
): ReconstructabilityAssessment {
  const observedTotal = volatilityWindowDiagnostics.observationsAttempted;
  const observations = volatilityWindowDiagnostics.observations;
  const earliestFeatureEvaluableTimestampMs = deriveEarliestFeatureEvaluableTimestampMs({
    firstUsableCausalBtcTimestampMs: options.firstUsableCausalBtcTimestampMs,
    returnIntervalMs: options.returnIntervalMs,
    requiredCloseCount: options.requiredCloseCount,
  });

  const structuralExclusionCountsByReason = emptyStructuralCounts();
  const reconstructionFailureCountsByReason = emptyFailureCounts();
  let structurallyExcludedCount = 0;
  let availableCount = 0;
  let reconstructionFailureCount = 0;
  let continuityFailuresAmongEvaluable = 0;

  for (const observation of observations) {
    const structural = classifyStructuralExclusion({
      observation,
      firstUsableCausalBtcTimestampMs: options.firstUsableCausalBtcTimestampMs,
      earliestFeatureEvaluableTimestampMs,
    });
    if (structural !== null) {
      structurallyExcludedCount += 1;
      structuralExclusionCountsByReason[structural] =
        (structuralExclusionCountsByReason[structural] ?? 0) + 1;
      continue;
    }

    if (observation.attributionClass === "available") {
      availableCount += 1;
      continue;
    }

    reconstructionFailureCount += 1;
    reconstructionFailureCountsByReason[observation.attributionClass] =
      (reconstructionFailureCountsByReason[observation.attributionClass] ?? 0) + 1;
    if (CONTINUITY_FAILURE_CLASSES.has(observation.attributionClass)) {
      continuityFailuresAmongEvaluable += 1;
    }
  }

  const featureEvaluableCount = observedTotal - structurallyExcludedCount;
  const availableShareOfEvaluable = safeShare(availableCount, featureEvaluableCount);
  const continuityFailureShareOfEvaluable = safeShare(
    continuityFailuresAmongEvaluable,
    featureEvaluableCount,
  );

  const base = {
    denominatorDefinition: RECONSTRUCTABILITY_DENOMINATOR_DEFINITION,
    observedTotal,
    structurallyExcludedCount,
    featureEvaluableCount,
    availableCount,
    reconstructionFailureCount,
    structuralExclusionCountsByReason,
    reconstructionFailureCountsByReason,
    earliestFeatureEvaluableTimestampMs,
    firstUsableCausalBtcTimestampMs: options.firstUsableCausalBtcTimestampMs,
    availableShareOfEvaluable,
    continuityFailureShareOfEvaluable,
  } as const;

  if (historicalAmbiguous) {
    return {
      ...base,
      reconstructable: false,
      reason:
        "Historical feature definition is ambiguous; reconstructability against a unique historical contract cannot be established.",
    };
  }

  if (!contractEquivalent) {
    return {
      ...base,
      reconstructable: false,
      reason: "Forward contract is not semantically equivalent to the historical contract.",
    };
  }

  if (featureEvaluableCount === 0) {
    return {
      ...base,
      reconstructable: false,
      reason:
        "insufficient-evaluable-forward-duration: no feature-evaluable observations remain after structural warm-up / pre-first-causal-source exclusions; structural exclusions are not reconstruction failures and do not alone imply capture redesign.",
    };
  }

  const reconstructable =
    featureEvaluableCount > 0
    && availableCount === featureEvaluableCount
    && reconstructionFailureCount === 0;

  return {
    ...base,
    reconstructable,
    reason: reconstructable
      ? "Contracts are equivalent and every feature-evaluable observation reconstructed an available volatility window. Structural warm-up / pre-first-causal-source exclusions are not treated as failures."
      : "Contracts are equivalent but at least one feature-evaluable observation failed volatility-window reconstruction (in-domain failure after earliestFeatureEvaluableTimestampMs, or a non-history failure during warm-up).",
  };
}
