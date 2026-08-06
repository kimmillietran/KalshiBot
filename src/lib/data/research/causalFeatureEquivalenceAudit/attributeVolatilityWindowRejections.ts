import { percentile } from "@/lib/utils/stats";

import type { BtcSpotPoint } from "../btcKalshiLeadLagAnalysis/causalBtcJoin";
import {
  buildValidatedCausalVolatilityWindow,
  type VolatilityWindowRejectionReason,
} from "../calibrationFadeForwardValidation/buildValidatedCausalVolatilityWindow";
import { safeShare } from "../calibrationFadeForwardValidation/calibrationFadeForwardValidationUtils";

import {
  VOLATILITY_WINDOW_ATTRIBUTION_CLASSES,
  type AttributionClassStats,
  type VolatilityWindowAttributionClass,
  type VolatilityWindowDiagnostics,
} from "./causalFeatureEquivalenceAuditTypes";

export type QuoteForAttribution = {
  marketTicker: string;
  timestampMs: number;
};

export type AttributionOptions = {
  barIntervalMs: number;
  lookbackBars: number;
  maximumSourceGapMs: number;
  maxExamplesPerClass?: number;
  /** Counts point examinations for performance assertions. */
  opCounter?: { pointExaminations: number };
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

function mapProductionReason(
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
    default:
      // invalid-* config reasons should not appear for production frozen params
      return "insufficient-source-points";
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
 */
export function attributeSourceGapClass(input: {
  points: readonly BtcSpotPoint[];
  timestampMs: number;
  barIntervalMs: number;
  lookbackBars: number;
  maximumSourceGapMs: number;
  opCounter?: { pointExaminations: number };
}): { class: VolatilityWindowAttributionClass; failingGapMs: number } | null {
  const { timestampMs, barIntervalMs, lookbackBars, maximumSourceGapMs, opCounter } = input;
  const requiredBars = lookbackBars + 1;

  // Assume points are already ascending (production would have rejected otherwise).
  const causalPoints: BtcSpotPoint[] = [];
  for (const point of input.points) {
    if (opCounter) {
      opCounter.pointExaminations += 1;
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

  // Build candles (same as production) to locate window.
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

function upperBoundIndex(points: readonly BtcSpotPoint[], timestampMs: number): number {
  let left = 0;
  let right = points.length;
  while (left < right) {
    const middle = Math.floor((left + right) / 2);
    if (points[middle]!.timestampMs <= timestampMs) {
      left = middle + 1;
    } else {
      right = middle;
    }
  }
  return left;
}

/**
 * Classifies each quote-time volatility attempt into a single first-failure class.
 * Uses production buildValidatedCausalVolatilityWindow for available vs rejection,
 * then finer attribution for source-gap-exceeded.
 *
 * Performance: binary-search window slice per quote → O((N+M) log M) class work,
 * avoiding a full N×M nested scan over the entire series.
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

  // Warm-up horizon: lookback bars × bar interval plus one gap of max source gap × points.
  // Use a generous causal lookback window so the production builder sees enough history.
  const lookbackHorizonMs =
    (options.lookbackBars + 2) * options.barIntervalMs + options.maximumSourceGapMs * 4;

  for (const quote of quotes) {
    const endExclusive = upperBoundIndex(points, quote.timestampMs);
    // Include a small future tail so production can count future-only / future points.
    let futureEnd = endExclusive;
    while (futureEnd < points.length && points[futureEnd]!.timestampMs <= quote.timestampMs + 1) {
      futureEnd += 1;
    }
    // Also include a few future points for future-only detection without scanning all M.
    const futureTail = Math.min(points.length, endExclusive + 8);
    const startMs = quote.timestampMs - lookbackHorizonMs;
    let startIndex = upperBoundIndex(points, startMs - 1);
    // Ensure we include predecessor for start-boundary when possible.
    startIndex = Math.max(0, startIndex - 1);
    const windowPoints = points.slice(startIndex, Math.max(futureTail, endExclusive));

    if (options.opCounter) {
      options.opCounter.pointExaminations += windowPoints.length;
    }

    const result = buildValidatedCausalVolatilityWindow({
      points: windowPoints,
      timestampMs: quote.timestampMs,
      barIntervalMs: options.barIntervalMs,
      lookbackBars: options.lookbackBars,
      maximumSourceGapMs: options.maximumSourceGapMs,
    });

    let attributionClass: VolatilityWindowAttributionClass;
    let failingGapMs: number | null = null;

    if (result.available) {
      attributionClass = "available";
    } else if (result.rejectionReason) {
      productionRejectionReasonCounts[result.rejectionReason] =
        (productionRejectionReasonCounts[result.rejectionReason] ?? 0) + 1;
      const mapped = mapProductionReason(result.rejectionReason);
      if (mapped === "source-gap-exceeded") {
        const finer = attributeSourceGapClass({
          points: windowPoints,
          timestampMs: quote.timestampMs,
          barIntervalMs: options.barIntervalMs,
          lookbackBars: options.lookbackBars,
          maximumSourceGapMs: options.maximumSourceGapMs,
          opCounter: options.opCounter,
        });
        if (finer) {
          attributionClass = finer.class;
          failingGapMs = finer.failingGapMs;
        } else {
          // Fallback: use observed max gap as trailing if finer attribution cannot resolve.
          attributionClass = "trailing-source-age-exceeded";
          failingGapMs = result.maximumObservedSourceGapMs;
        }
      } else {
        attributionClass = mapped;
        failingGapMs = result.maximumObservedSourceGapMs;
      }
    } else {
      attributionClass = "insufficient-source-points";
    }

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
  };
}
