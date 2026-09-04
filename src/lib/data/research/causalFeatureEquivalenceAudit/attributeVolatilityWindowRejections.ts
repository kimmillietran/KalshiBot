import { percentile } from "@/lib/utils/stats";

import type { BtcSpotPoint } from "../btcKalshiLeadLagAnalysis/causalBtcJoin";
import {
  buildValidatedCausalVolatilityWindow,
  precomputeCausalVolatilitySourceIntegrity,
  type VolatilityWindowRejectionReason,
} from "../calibrationFadeForwardValidation/buildValidatedCausalVolatilityWindow";
import { safeShare } from "../calibrationFadeForwardValidation/calibrationFadeForwardValidationUtils";

import {
  VOLATILITY_WINDOW_ATTRIBUTION_CLASSES,
  CausalFeatureEquivalenceAuditError,
  type AttributionClassStats,
  type VolatilityWindowAttributionClass,
  type VolatilityWindowAttributionObservation,
  type VolatilityWindowDiagnostics,
} from "./causalFeatureEquivalenceAuditTypes";

export type QuoteForAttribution = {
  marketTicker: string;
  timestampMs: number;
};

export type AttributionOpCounter = {
  /** Raw points examined during the one-time full-series integrity preprocess. */
  prefixPointsExamined: number;
  /** Binary-search / cursor comparisons while resolving causal ends. */
  causalEndComparisons: number;
  /** Points examined while selecting or evaluating the bounded trailing window. */
  windowPointsExamined: number;
  /** Times a full causal prefix was copied or scanned from index 0 after preprocess. */
  fullPrefixCopiesOrScans: number;
  /** Invocations of the production window helper. */
  productionHelperInvocations: number;
};

export type AttributionOptions = {
  barIntervalMs: number;
  lookbackBars: number;
  maximumSourceGapMs: number;
  maxExamplesPerClass?: number;
  /** Structured counters for performance assertions (preferred). */
  opCounter?: AttributionOpCounter;
};

type MutableClass = {
  observationCount: number;
  markets: Set<string>;
  failingGaps: number[];
  examples: { marketTicker: string; timestampMs: number; failingGapMs: number | null }[];
};

function emptyClasses(): Record<VolatilityWindowAttributionClass, MutableClass> {
  const result = {} as Record<VolatilityWindowAttributionClass, MutableClass>;
  for (const className of VOLATILITY_WINDOW_ATTRIBUTION_CLASSES) {
    result[className] = {
      observationCount: 0,
      markets: new Set(),
      failingGaps: [],
      examples: [],
    };
  }
  return result;
}

function assertNever(value: never, message: string): never {
  throw new CausalFeatureEquivalenceAuditError(message);
}

/**
 * Exhaustive production-reason → attribution-class mapping.
 * Unknown runtime reasons throw (fail closed). Config-invalid reasons are mapped
 * to themselves only when they appear; they are not silently remapped to
 * insufficient-source-points or trailing-source-age-exceeded.
 */
export function mapProductionReasonToAttributionClass(
  reason: VolatilityWindowRejectionReason,
): VolatilityWindowAttributionClass | "source-gap-exceeded" {
  switch (reason) {
    case "insufficient-source-points":
      return "insufficient-source-points";
    case "insufficient-bars":
      return "insufficient-bars";
    case "future-only-source":
      return "future-only-source";
    case "invalid-source-price":
      return "invalid-source-price";
    case "non-ascending-timestamps":
      return "non-ascending-source";
    case "conflicting-duplicate-timestamp":
      return "conflicting-duplicate-source";
    case "missing-minute-bucket":
      return "missing-minute-bucket";
    case "nonconsecutive-bars":
      return "nonconsecutive-bars";
    case "volatility-estimate-unavailable":
      return "volatility-estimate-unavailable";
    case "source-gap-exceeded":
      return "source-gap-exceeded";
    case "invalid-quote-timestamp":
    case "invalid-bar-interval":
    case "invalid-lookback":
    case "invalid-maximum-source-gap":
      throw new CausalFeatureEquivalenceAuditError(
        `Unexpected production rejection reason under frozen params: ${reason}`,
      );
    default:
      return assertNever(
        reason,
        `Unknown volatility window rejection reason: ${String(reason)}`,
      );
  }
}

function bucketStartFor(timestampMs: number, barIntervalMs: number): number {
  return Math.floor(timestampMs / barIntervalMs) * barIntervalMs;
}

function isValidPrice(priceUsd: number): boolean {
  return Number.isFinite(priceUsd) && priceUsd > 0;
}

/**
 * Attribute the first failing gap class when production rejected for source-gap-exceeded.
 * Mirrors buildValidatedCausalVolatilityWindow boundary order: start → internal → trailing.
 * Returns null only when the failing gap cannot be proven; callers must fail closed.
 */
export function attributeSourceGapClass(input: {
  points: readonly BtcSpotPoint[];
  timestampMs: number;
  barIntervalMs: number;
  lookbackBars: number;
  maximumSourceGapMs: number;
  opCounter?: { windowPointsExamined?: number };
}): { class: VolatilityWindowAttributionClass; failingGapMs: number } | null {
  const { timestampMs, barIntervalMs, lookbackBars, maximumSourceGapMs, opCounter } = input;
  const requiredBars = lookbackBars + 1;

  const causalPoints: BtcSpotPoint[] = [];
  for (const point of input.points) {
    if (opCounter && opCounter.windowPointsExamined !== undefined) {
      opCounter.windowPointsExamined += 1;
    }
    if (point.timestampMs > timestampMs) {
      break;
    }
    causalPoints.push(point);
  }
  if (causalPoints.length < requiredBars) {
    return null;
  }

  const pricedPoints = causalPoints.filter((point) => isValidPrice(point.priceUsd));
  if (pricedPoints.length === 0) {
    return null;
  }

  const candles: { timestamp: number }[] = [];
  let bucketStart = bucketStartFor(pricedPoints[0]!.timestampMs, barIntervalMs);
  for (const point of pricedPoints) {
    const bucket = bucketStartFor(point.timestampMs, barIntervalMs);
    if (bucket !== bucketStart) {
      candles.push({ timestamp: bucketStart });
      bucketStart = bucket;
    }
  }
  candles.push({ timestamp: bucketStart });
  if (candles.length < requiredBars) {
    return null;
  }

  const window = candles.slice(-requiredBars);
  const windowStartMs = window[0]!.timestamp;
  const firstSelectedIndex = causalPoints.findIndex((point) => point.timestampMs >= windowStartMs);
  if (firstSelectedIndex < 0) {
    return null;
  }
  const selectedPoints = causalPoints.slice(firstSelectedIndex);
  const predecessorPoint = firstSelectedIndex > 0 ? causalPoints[firstSelectedIndex - 1]! : null;
  const gapBoundaryStartMs = predecessorPoint ? predecessorPoint.timestampMs : windowStartMs;

  const startGap = selectedPoints[0]!.timestampMs - gapBoundaryStartMs;
  if (startGap > maximumSourceGapMs) {
    return { class: "start-boundary-gap-exceeded", failingGapMs: startGap };
  }

  for (let index = 1; index < selectedPoints.length; index += 1) {
    const gap = selectedPoints[index]!.timestampMs - selectedPoints[index - 1]!.timestampMs;
    if (gap > maximumSourceGapMs) {
      return { class: "internal-source-gap-exceeded", failingGapMs: gap };
    }
  }

  const trailingGap = timestampMs - selectedPoints[selectedPoints.length - 1]!.timestampMs;
  if (trailingGap > maximumSourceGapMs) {
    return { class: "trailing-source-age-exceeded", failingGapMs: trailingGap };
  }

  return null;
}

function upperBoundIndex(
  points: readonly BtcSpotPoint[],
  timestampMs: number,
  opCounter?: AttributionOpCounter,
): number {
  let left = 0;
  let right = points.length;
  while (left < right) {
    const middle = Math.floor((left + right) / 2);
    if (opCounter) {
      opCounter.causalEndComparisons += 1;
    }
    if (points[middle]!.timestampMs <= timestampMs) {
      left = middle + 1;
    } else {
      right = middle;
    }
  }
  return left;
}

/**
 * Select the minimal trailing slice that still contains the production trailing
 * lookbackBars+1 priced minute buckets (plus one priced predecessor bucket),
 * walking backward from the causal end. Matches production candle formation,
 * which builds candles only from finite positive prices.
 * Never copies points[0..causalEnd) unless the window itself spans that prefix.
 */
function selectBoundedWindowSlice(
  orderedPoints: readonly BtcSpotPoint[],
  causalEndExclusive: number,
  barIntervalMs: number,
  lookbackBars: number,
  opCounter?: AttributionOpCounter,
): readonly BtcSpotPoint[] {
  if (causalEndExclusive <= 0) {
    return [];
  }
  const requiredBars = lookbackBars + 1;
  const pricedBuckets = new Set<number>();
  let startIndex = 0;
  for (let index = causalEndExclusive - 1; index >= 0; index -= 1) {
    if (opCounter) {
      opCounter.windowPointsExamined += 1;
    }
    const point = orderedPoints[index]!;
    startIndex = index;
    if (isValidPrice(point.priceUsd)) {
      pricedBuckets.add(bucketStartFor(point.timestampMs, barIntervalMs));
      // requiredBars trailing candles + one earlier priced bucket for predecessor.
      if (pricedBuckets.size > requiredBars) {
        break;
      }
    }
  }
  return orderedPoints.slice(startIndex, causalEndExclusive);
}

function createOpCounter(existing?: AttributionOpCounter): AttributionOpCounter {
  return (
    existing ?? {
      prefixPointsExamined: 0,
      causalEndComparisons: 0,
      windowPointsExamined: 0,
      fullPrefixCopiesOrScans: 0,
      productionHelperInvocations: 0,
    }
  );
}

/**
 * Classifies each quote-time volatility attempt into a single first-failure class.
 *
 * Architecture:
 * A. Precompute full-series causal integrity once O(M) (ordering / conflicting dups).
 * B. Per quote: binary-search causal end; if series integrity failed, attribute that
 *    production rejection without trimming history; otherwise evaluate a bounded
 *    trailing window with production semantics.
 * C. Differential callers use production on the full series as oracle.
 *
 * Invariant: audit.available === production.available on the full series.
 * Source-gap refinement is fail-closed when the failing boundary cannot be proven.
 */
export function attributeVolatilityWindowRejections(
  quotes: readonly QuoteForAttribution[],
  points: readonly BtcSpotPoint[],
  options: AttributionOptions,
): VolatilityWindowDiagnostics {
  const maxExamples = options.maxExamplesPerClass ?? 5;
  const classes = emptyClasses();
  const productionRejectionReasonCounts: Partial<Record<VolatilityWindowRejectionReason, number>> =
    {};
  const opCounter = createOpCounter(options.opCounter);

  const integrity = precomputeCausalVolatilitySourceIntegrity(points);
  opCounter.prefixPointsExamined += integrity.pointsExamined;
  const observations: VolatilityWindowAttributionObservation[] = [];

  for (const quote of quotes) {
    let attributionClass: VolatilityWindowAttributionClass;
    let failingGapMs: number | null = null;
    let productionRejectionReason: VolatilityWindowRejectionReason | null = null;

    if (!integrity.ok) {
      productionRejectionReason = integrity.rejectionReason;
      productionRejectionReasonCounts[integrity.rejectionReason] =
        (productionRejectionReasonCounts[integrity.rejectionReason] ?? 0) + 1;
      const mapped = mapProductionReasonToAttributionClass(integrity.rejectionReason);
      if (mapped === "source-gap-exceeded") {
        throw new CausalFeatureEquivalenceAuditError(
          "Series integrity rejection cannot be source-gap-exceeded",
        );
      }
      attributionClass = mapped;
    } else {
      const causalEndExclusive = upperBoundIndex(
        integrity.points,
        quote.timestampMs,
        opCounter,
      );
      const futurePointCount = integrity.points.length - causalEndExclusive;

      if (causalEndExclusive === 0) {
        if (futurePointCount > 0) {
          productionRejectionReason = "future-only-source";
          productionRejectionReasonCounts["future-only-source"] =
            (productionRejectionReasonCounts["future-only-source"] ?? 0) + 1;
          attributionClass = "future-only-source";
        } else {
          productionRejectionReason = "insufficient-source-points";
          productionRejectionReasonCounts["insufficient-source-points"] =
            (productionRejectionReasonCounts["insufficient-source-points"] ?? 0) + 1;
          attributionClass = "insufficient-source-points";
        }
      } else {
        const windowPoints = selectBoundedWindowSlice(
          integrity.points,
          causalEndExclusive,
          options.barIntervalMs,
          options.lookbackBars,
          opCounter,
        );

        opCounter.productionHelperInvocations += 1;
        const result = buildValidatedCausalVolatilityWindow({
          points: windowPoints,
          timestampMs: quote.timestampMs,
          barIntervalMs: options.barIntervalMs,
          lookbackBars: options.lookbackBars,
          maximumSourceGapMs: options.maximumSourceGapMs,
        });

        if (result.available) {
          attributionClass = "available";
          productionRejectionReason = null;
        } else if (result.rejectionReason) {
          productionRejectionReason = result.rejectionReason;
          productionRejectionReasonCounts[result.rejectionReason] =
            (productionRejectionReasonCounts[result.rejectionReason] ?? 0) + 1;
          const mapped = mapProductionReasonToAttributionClass(result.rejectionReason);
          if (mapped === "source-gap-exceeded") {
            const finer = attributeSourceGapClass({
              points: windowPoints,
              timestampMs: quote.timestampMs,
              barIntervalMs: options.barIntervalMs,
              lookbackBars: options.lookbackBars,
              maximumSourceGapMs: options.maximumSourceGapMs,
              opCounter,
            });
            if (!finer) {
              throw new CausalFeatureEquivalenceAuditError(
                `Attribution consistency error: production rejected source-gap-exceeded at ${quote.timestampMs} but the failing start/internal/trailing gap could not be proven`,
              );
            }
            attributionClass = finer.class;
            failingGapMs = finer.failingGapMs;
          } else {
            attributionClass = mapped;
            failingGapMs = result.maximumObservedSourceGapMs;
          }
        } else {
          throw new CausalFeatureEquivalenceAuditError(
            "Production window returned unavailable without a rejection reason",
          );
        }
      }
    }

    observations.push({
      marketTicker: quote.marketTicker,
      timestampMs: quote.timestampMs,
      attributionClass,
      productionRejectionReason,
      failingGapMs,
    });

    const bucket = classes[attributionClass];
    bucket.observationCount += 1;
    bucket.markets.add(quote.marketTicker);
    if (failingGapMs !== null && Number.isFinite(failingGapMs)) {
      bucket.failingGaps.push(failingGapMs);
    }
    if (bucket.examples.length < maxExamples) {
      bucket.examples.push({
        marketTicker: quote.marketTicker,
        timestampMs: quote.timestampMs,
        failingGapMs,
      });
    }
  }

  // Mirror counters onto the caller's object when provided.
  if (options.opCounter) {
    options.opCounter.prefixPointsExamined = opCounter.prefixPointsExamined;
    options.opCounter.causalEndComparisons = opCounter.causalEndComparisons;
    options.opCounter.windowPointsExamined = opCounter.windowPointsExamined;
    options.opCounter.fullPrefixCopiesOrScans = opCounter.fullPrefixCopiesOrScans;
    options.opCounter.productionHelperInvocations = opCounter.productionHelperInvocations;
  }

  const total = quotes.length;
  const classStats: AttributionClassStats[] = VOLATILITY_WINDOW_ATTRIBUTION_CLASSES.map(
    (className) => {
      const bucket = classes[className];
      const sortedGaps = [...bucket.failingGaps].sort((left, right) => left - right);
      return {
        class: className,
        observationCount: bucket.observationCount,
        observationShare: safeShare(bucket.observationCount, total),
        affectedMarketCount: bucket.markets.size,
        representativeExamples: bucket.examples,
        minimumFailingGapMs: sortedGaps[0] ?? null,
        maximumFailingGapMs: sortedGaps[sortedGaps.length - 1] ?? null,
        p50FailingGapMs: sortedGaps.length ? percentile(sortedGaps, 50) : null,
        p90FailingGapMs: sortedGaps.length ? percentile(sortedGaps, 90) : null,
      };
    },
  );

  return {
    observationsAttempted: total,
    classes: classStats,
    productionRejectionReasonCounts,
    observations,
  };
}

export function createEmptyAttributionOpCounter(): AttributionOpCounter {
  return createOpCounter();
}
