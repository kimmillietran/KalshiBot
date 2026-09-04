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
 * yield an available `requiredCloseCount`-bar window under healthy continuity.
 *
 * Locked to buildValidatedCausalVolatilityWindow geometry:
 * 1. F = first usable causal BTC sample; B0 = floor(F / I) * I.
 * 2. Start-boundary rule: firstSelected − windowStart (or predecessor gap) must
 *    be ≤ maximumSourceGapMs. When initialOffsetMs = F − B0 > G, bucket B0 cannot
 *    be the window start, so the first eligible window start advances to B0 + I.
 * 3. Window end Wend = firstEligibleWindowStart + (requiredCloseCount − 1) * I.
 * 4. Ending-minute phase: include-in-progress-minute-when-sampled needs a causal
 *    sample in [Wend, quote]. Under a regular healthy cadence starting at F, the
 *    earliest such quote is the first in-phase sample at or after Wend.
 *
 * Never treats later outages as structural: callers compare observation timestamps
 * to this run-relative boundary; start-boundary-gap-exceeded after the boundary
 * remains an in-domain failure.
 */
export function deriveEarliestFeatureEvaluableTimestampMs(input: {
  firstUsableCausalBtcTimestampMs: number | null;
  returnIntervalMs: number;
  requiredCloseCount: number;
  maximumSourceGapMs: number;
  /**
   * Regular healthy source period used to place the first sample in the ending
   * in-progress minute (Option A phase). When null/omitted, Wend itself is used
   * (millisecond-dense / quote-aligned sources). Infer once O(M) from run-start
   * intervals via inferHealthySourceCadenceMs when available.
   */
  healthySourceCadenceMs?: number | null;
}): number | null {
  const {
    firstUsableCausalBtcTimestampMs,
    returnIntervalMs,
    requiredCloseCount,
    maximumSourceGapMs,
    healthySourceCadenceMs = null,
  } = input;
  if (
    firstUsableCausalBtcTimestampMs === null
    || !Number.isFinite(firstUsableCausalBtcTimestampMs)
    || !Number.isSafeInteger(returnIntervalMs)
    || returnIntervalMs <= 0
    || !Number.isSafeInteger(requiredCloseCount)
    || requiredCloseCount < 2
    || !Number.isSafeInteger(maximumSourceGapMs)
    || maximumSourceGapMs < 0
  ) {
    return null;
  }

  const firstBucketStart =
    Math.floor(firstUsableCausalBtcTimestampMs / returnIntervalMs) * returnIntervalMs;
  const initialOffsetMs = firstUsableCausalBtcTimestampMs - firstBucketStart;
  const firstEligibleWindowStartMs =
    initialOffsetMs <= maximumSourceGapMs
      ? firstBucketStart
      : firstBucketStart + returnIntervalMs;
  const windowEndMs =
    firstEligibleWindowStartMs + (requiredCloseCount - 1) * returnIntervalMs;

  if (
    healthySourceCadenceMs === null
    || healthySourceCadenceMs === undefined
    || !Number.isSafeInteger(healthySourceCadenceMs)
    || healthySourceCadenceMs <= 0
  ) {
    return windowEndMs;
  }

  if (windowEndMs <= firstUsableCausalBtcTimestampMs) {
    return firstUsableCausalBtcTimestampMs;
  }
  const steps = Math.ceil(
    (windowEndMs - firstUsableCausalBtcTimestampMs) / healthySourceCadenceMs,
  );
  return firstUsableCausalBtcTimestampMs + steps * healthySourceCadenceMs;
}

/** @see deriveEarliestFeatureEvaluableTimestampMs */
export const deriveEarliestFeatureEvaluableBoundary =
  deriveEarliestFeatureEvaluableTimestampMs;

/**
 * Infers a regular healthy source cadence from early adjacent intervals after the
 * first usable causal sample (O(M), single pass; stops after a small sample).
 */
export function inferHealthySourceCadenceMs(
  points: readonly { timestampMs: number; priceUsd: number }[],
  firstUsableCausalBtcTimestampMs: number | null,
): number | null {
  if (
    firstUsableCausalBtcTimestampMs === null
    || !Number.isFinite(firstUsableCausalBtcTimestampMs)
  ) {
    return null;
  }
  const intervals: number[] = [];
  let previous: number | null = null;
  for (const point of points) {
    if (
      !Number.isFinite(point.timestampMs)
      || !Number.isFinite(point.priceUsd)
      || point.priceUsd <= 0
      || point.timestampMs < firstUsableCausalBtcTimestampMs
    ) {
      continue;
    }
    if (previous !== null) {
      const gap = point.timestampMs - previous;
      if (gap > 0) {
        intervals.push(gap);
        if (intervals.length >= 32) {
          break;
        }
      }
    }
    previous = point.timestampMs;
  }
  if (intervals.length === 0) {
    return null;
  }
  intervals.sort((left, right) => left - right);
  return intervals[Math.floor((intervals.length - 1) / 2)]!;
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
 * Timestamp is compared to run-relative boundaries; only run-start attributable
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

  // Finite-run warm-up: before production could possibly accept a window under
  // healthy run-start geometry (bar count and/or start-boundary phase).
  if (
    earliestFeatureEvaluableTimestampMs !== null
    && observation.timestampMs < earliestFeatureEvaluableTimestampMs
  ) {
    if (HISTORY_INSUFFICIENCY_CLASSES.has(observation.attributionClass)) {
      return "feature-warmup-insufficient-history";
    }
    // Run-relative: start-boundary gaps before the evaluable boundary are the
    // truncated first-bucket offset, not a later outage. After the boundary,
    // the same class remains an in-domain failure.
    if (observation.attributionClass === "start-boundary-gap-exceeded") {
      return "other-structural-boundary";
    }
  }

  // At/after earliestFeatureEvaluableTimestampMs: history insufficiency and
  // continuity failures are real reconstruction failures.
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
    maximumSourceGapMs: number;
    healthySourceCadenceMs?: number | null;
  },
): ReconstructabilityAssessment {
  const observedTotal = volatilityWindowDiagnostics.observationsAttempted;
  const observations = volatilityWindowDiagnostics.observations;
  const earliestFeatureEvaluableTimestampMs = deriveEarliestFeatureEvaluableTimestampMs({
    firstUsableCausalBtcTimestampMs: options.firstUsableCausalBtcTimestampMs,
    returnIntervalMs: options.returnIntervalMs,
    requiredCloseCount: options.requiredCloseCount,
    maximumSourceGapMs: options.maximumSourceGapMs,
    healthySourceCadenceMs: options.healthySourceCadenceMs,
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
