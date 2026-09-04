import type { EvaluationCandleSnapshot } from "@/types/domain/trading";
import { estimateRealizedVolatility } from "@/lib/data/strategies/fairValueDiffusion/fairValueDiffusionModel";

import type { BtcSpotPoint } from "../btcKalshiLeadLagAnalysis/causalBtcJoin";

export const VOLATILITY_WINDOW_REJECTION_REASONS = [
  "invalid-quote-timestamp",
  "invalid-bar-interval",
  "invalid-lookback",
  "invalid-maximum-source-gap",
  "non-ascending-timestamps",
  "conflicting-duplicate-timestamp",
  "future-only-source",
  "insufficient-source-points",
  "insufficient-bars",
  "missing-minute-bucket",
  "nonconsecutive-bars",
  "invalid-source-price",
  "source-gap-exceeded",
  "volatility-estimate-unavailable",
] as const;

export type VolatilityWindowRejectionReason = (typeof VOLATILITY_WINDOW_REJECTION_REASONS)[number];

/**
 * Immutable semantic descriptors shared by the production window builder and the
 * causal-feature-equivalence current-forward contract descriptor. Changing these
 * strings without updating production behavior is a contract drift bug.
 */
export const CAUSAL_VOLATILITY_WINDOW_CONTRACT_SEMANTICS = {
  sourceRecordType: "btc-spot-jsonl-points",
  timestampField: "exchangeTimestampMs??receivedAtMs",
  timestampMeaning: "exchange-preferred-else-received-at-local",
  quoteMinuteInclusionPolicy: "include-in-progress-minute-when-sampled",
  missingMinuteBehavior: "reject-missing-minute-bucket-no-fill",
  sourceGapDefinition:
    "adjacent-source-points-including-start-boundary-internal-and-trailing-to-quote",
  startBoundaryHandling:
    "predecessor-or-window-start-to-first-selected-point-must-be-within-maximumSourceGapMs",
  internalGapHandling: "adjacent-selected-source-gaps-must-be-within-maximumSourceGapMs",
  trailingGapHandling: "last-selected-source-to-quote-must-be-within-maximumSourceGapMs",
  duplicateHandling: "exact-timestamp-price-collapse-conflicting-price-reject",
  orderingHandling: "reject-non-ascending-input-no-resort",
  invalidPriceHandling: "reject-non-finite-or-non-positive-in-window-scope",
  // Full-series order/duplicate integrity runs before post-quote exclusion, so a
  // future conflicting duplicate can reject with futurePointCount still 0.
  // Points after the quote are excluded from candle/vol math only after that pass.
  futureSampleHandling:
    "full-series-order-and-duplicate-integrity-before-exclude-points-after-quote",
  quoteJoinAgeRole: "spot-join-staleness-gate-not-vol-source-gap",
} as const;

export type CausalVolatilityWindowContractSemantics =
  typeof CAUSAL_VOLATILITY_WINDOW_CONTRACT_SEMANTICS;

export type ValidatedCausalVolatilityWindow = {
  available: boolean;
  candles: readonly EvaluationCandleSnapshot[];
  annualizedVolatility: number | null;
  windowStartMs: number | null;
  windowEndMs: number | null;
  /**
   * Causal source points that back the evaluated trailing window (window start
   * through the quote timestamp) once the window is known; before the window is
   * resolved this is the causal point count considered so far.
   */
  sourcePointCount: number;
  barCount: number;
  /**
   * Largest observed source spacing across the evaluated window, including the
   * leading boundary gap (predecessor or window start to the first selected
   * point) and the trailing gap from the last selected point to the quote.
   */
  maximumObservedSourceGapMs: number | null;
  rejectionReason: VolatilityWindowRejectionReason | null;
  /**
   * Causal bar policy (preserved from buildBtcCandlesUpToTimestamp):
   * the in-progress minute bucket that contains the quote timestamp is included
   * when at least one causal BTC sample falls in that minute. Only completed
   * minutes are not required; partial/current-bar closes use the latest causal
   * sample at or before the quote.
   */
  includesInProgressMinuteBar: boolean;
  /** Points after the quote timestamp; never used for candles or volatility. */
  futurePointCount: number;
  /** Exact duplicate timestamp+price points collapsed from the input series. */
  duplicatePointCount: number;
  firstSelectedSourceTimestampMs: number | null;
  lastSelectedSourceTimestampMs: number | null;
};

type ValidatedCausalVolatilityWindowDetail = Partial<
  Omit<ValidatedCausalVolatilityWindow, "available" | "annualizedVolatility" | "rejectionReason">
>;

function rejected(
  reason: VolatilityWindowRejectionReason,
  detail: ValidatedCausalVolatilityWindowDetail = {},
): ValidatedCausalVolatilityWindow {
  return {
    available: false,
    candles: detail.candles ?? [],
    annualizedVolatility: null,
    windowStartMs: detail.windowStartMs ?? null,
    windowEndMs: detail.windowEndMs ?? null,
    sourcePointCount: detail.sourcePointCount ?? 0,
    barCount: detail.barCount ?? 0,
    maximumObservedSourceGapMs: detail.maximumObservedSourceGapMs ?? null,
    rejectionReason: reason,
    includesInProgressMinuteBar: detail.includesInProgressMinuteBar ?? false,
    futurePointCount: detail.futurePointCount ?? 0,
    duplicatePointCount: detail.duplicatePointCount ?? 0,
    firstSelectedSourceTimestampMs: detail.firstSelectedSourceTimestampMs ?? null,
    lastSelectedSourceTimestampMs: detail.lastSelectedSourceTimestampMs ?? null,
  };
}

function isValidPrice(priceUsd: number): boolean {
  return Number.isFinite(priceUsd) && priceUsd > 0;
}

function isPositiveSafeInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}

function isNonNegativeSafeInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

function bucketStartFor(timestampMs: number, barIntervalMs: number): number {
  return Math.floor(timestampMs / barIntervalMs) * barIntervalMs;
}

type OrderedSeries = {
  points: readonly BtcSpotPoint[];
  duplicatePointCount: number;
};

export type CausalVolatilitySourceIntegrity =
  | {
      ok: true;
      points: readonly BtcSpotPoint[];
      duplicatePointCount: number;
      /** Raw points examined while ordering the full series (exactly once). */
      pointsExamined: number;
    }
  | {
      ok: false;
      rejectionReason: Extract<
        VolatilityWindowRejectionReason,
        "non-ascending-timestamps" | "conflicting-duplicate-timestamp"
      >;
      /** Index in the raw input where the first integrity defect was observed. */
      firstDefectRawIndex: number;
      pointsExamined: number;
      duplicatePointCount: number;
    };

/**
 * Enforces ascending finite timestamps and applies duplicate policy B: exact
 * duplicate timestamp+price pairs collapse into a single point, while two
 * different prices at the same timestamp are unresolvable and rejected.
 *
 * Non-finite point timestamps cannot be ordered at all, so they are reported as
 * an ordering violation.
 *
 * Additive export of the same semantics used by buildValidatedCausalVolatilityWindow
 * so audits can precompute full-series integrity once (O(M)) without changing
 * production window behavior.
 */
export function orderCausalVolatilitySourcePoints(
  points: readonly BtcSpotPoint[],
): OrderedSeries | VolatilityWindowRejectionReason {
  const integrity = precomputeCausalVolatilitySourceIntegrity(points);
  if (!integrity.ok) {
    return integrity.rejectionReason;
  }
  return { points: integrity.points, duplicatePointCount: integrity.duplicatePointCount };
}

/**
 * Full-series causal-prefix integrity used by production-faithful attribution.
 * Scans each raw point exactly once; does not copy per quote.
 */
export function precomputeCausalVolatilitySourceIntegrity(
  points: readonly BtcSpotPoint[],
): CausalVolatilitySourceIntegrity {
  const ordered: BtcSpotPoint[] = [];
  let duplicatePointCount = 0;
  let pointsExamined = 0;

  for (let rawIndex = 0; rawIndex < points.length; rawIndex += 1) {
    const point = points[rawIndex]!;
    pointsExamined += 1;
    if (!Number.isFinite(point.timestampMs)) {
      return {
        ok: false,
        rejectionReason: "non-ascending-timestamps",
        firstDefectRawIndex: rawIndex,
        pointsExamined,
        duplicatePointCount,
      };
    }
    const previous = ordered[ordered.length - 1];
    if (previous) {
      if (point.timestampMs < previous.timestampMs) {
        return {
          ok: false,
          rejectionReason: "non-ascending-timestamps",
          firstDefectRawIndex: rawIndex,
          pointsExamined,
          duplicatePointCount,
        };
      }
      if (point.timestampMs === previous.timestampMs) {
        if (!Object.is(point.priceUsd, previous.priceUsd)) {
          return {
            ok: false,
            rejectionReason: "conflicting-duplicate-timestamp",
            firstDefectRawIndex: rawIndex,
            pointsExamined,
            duplicatePointCount,
          };
        }
        duplicatePointCount += 1;
        continue;
      }
    }
    ordered.push(point);
  }

  return {
    ok: true,
    points: ordered,
    duplicatePointCount,
    pointsExamined,
  };
}

function orderSeries(
  points: readonly BtcSpotPoint[],
): OrderedSeries | VolatilityWindowRejectionReason {
  return orderCausalVolatilitySourcePoints(points);
}
function buildMinuteCandles(
  points: readonly BtcSpotPoint[],
  barIntervalMs: number,
): EvaluationCandleSnapshot[] {
  const candles: EvaluationCandleSnapshot[] = [];
  let bucketStart = bucketStartFor(points[0]!.timestampMs, barIntervalMs);
  let open = points[0]!.priceUsd;
  let high = open;
  let low = open;
  let close = open;

  for (const point of points) {
    const bucket = bucketStartFor(point.timestampMs, barIntervalMs);
    if (bucket !== bucketStart) {
      candles.push({ timestamp: bucketStart, open, high, low, close });
      // No fill: skipped buckets stay absent and are caught by the window
      // consecutiveness check below.
      bucketStart = bucket;
      open = point.priceUsd;
      high = point.priceUsd;
      low = point.priceUsd;
      close = point.priceUsd;
      continue;
    }
    high = Math.max(high, point.priceUsd);
    low = Math.min(low, point.priceUsd);
    close = point.priceUsd;
  }
  candles.push({ timestamp: bucketStart, open, high, low, close });

  return candles;
}

/**
 * Builds a calibration-fade-specific validated causal volatility window.
 * Prefer this over changing global estimateRealizedVolatility.
 *
 * Requires lookbackBars+1 consecutive one-minute candles, source gaps
 * <= maximumSourceGapMs (including window boundary gaps), no fill or
 * interpolation, and causal samples only.
 *
 * Input point order must be ascending (same contract as
 * buildBtcCandlesUpToTimestamp / preloadBtcSpotSeries); out-of-order inputs are
 * rejected rather than re-sorted. Price validity is scoped to the evaluated
 * trailing window plus the predecessor point needed for the leading boundary
 * gap, so bad samples far behind the window do not invalidate a usable window.
 */
export function buildValidatedCausalVolatilityWindow(input: {
  points: readonly BtcSpotPoint[];
  timestampMs: number;
  barIntervalMs: number;
  lookbackBars: number;
  maximumSourceGapMs: number;
}): ValidatedCausalVolatilityWindow {
  const { timestampMs, barIntervalMs, lookbackBars, maximumSourceGapMs } = input;

  if (!Number.isFinite(timestampMs)) {
    return rejected("invalid-quote-timestamp");
  }
  if (!isPositiveSafeInteger(barIntervalMs)) {
    return rejected("invalid-bar-interval");
  }
  if (!Number.isSafeInteger(lookbackBars) || lookbackBars < 2) {
    return rejected("invalid-lookback");
  }
  if (!isNonNegativeSafeInteger(maximumSourceGapMs)) {
    return rejected("invalid-maximum-source-gap");
  }

  const requiredBars = lookbackBars + 1;

  const orderedSeries = orderSeries(input.points);
  if (typeof orderedSeries === "string") {
    return rejected(orderedSeries);
  }
  const { duplicatePointCount } = orderedSeries;

  const causalPoints: BtcSpotPoint[] = [];
  let futurePointCount = 0;
  for (const point of orderedSeries.points) {
    if (point.timestampMs > timestampMs) {
      futurePointCount += 1;
      continue;
    }
    causalPoints.push(point);
  }

  const seriesDetail: ValidatedCausalVolatilityWindowDetail = {
    futurePointCount,
    duplicatePointCount,
  };

  if (causalPoints.length === 0 && futurePointCount > 0) {
    return rejected("future-only-source", seriesDetail);
  }

  if (causalPoints.length < requiredBars) {
    return rejected("insufficient-source-points", {
      ...seriesDetail,
      sourcePointCount: causalPoints.length,
    });
  }

  // Candles are built from causal points with usable prices; invalid prices are
  // rejected later, but only when they fall inside the evaluated window scope.
  const pricedPoints = causalPoints.filter((point) => isValidPrice(point.priceUsd));
  if (pricedPoints.length === 0) {
    return rejected("invalid-source-price", {
      ...seriesDetail,
      sourcePointCount: causalPoints.length,
    });
  }

  const candles = buildMinuteCandles(pricedPoints, barIntervalMs);
  const quoteMinuteStart = bucketStartFor(timestampMs, barIntervalMs);
  const includesInProgressMinuteBar = candles[candles.length - 1]!.timestamp === quoteMinuteStart;

  if (candles.length < requiredBars) {
    return rejected("insufficient-bars", {
      ...seriesDetail,
      candles,
      sourcePointCount: causalPoints.length,
      barCount: candles.length,
      includesInProgressMinuteBar,
    });
  }

  const window = candles.slice(-requiredBars);
  const windowStartMs = window[0]!.timestamp;
  const windowEndMs = window[window.length - 1]!.timestamp;

  const firstSelectedIndex = causalPoints.findIndex(
    (point) => point.timestampMs >= windowStartMs,
  );
  const selectedPoints = causalPoints.slice(firstSelectedIndex);
  const predecessorPoint = firstSelectedIndex > 0 ? causalPoints[firstSelectedIndex - 1]! : null;

  const windowDetail: ValidatedCausalVolatilityWindowDetail = {
    ...seriesDetail,
    candles: window,
    sourcePointCount: selectedPoints.length,
    barCount: window.length,
    windowStartMs,
    windowEndMs,
    includesInProgressMinuteBar,
    firstSelectedSourceTimestampMs: selectedPoints[0]?.timestampMs ?? null,
    lastSelectedSourceTimestampMs:
      selectedPoints[selectedPoints.length - 1]?.timestampMs ?? null,
  };

  const scopedPoints = predecessorPoint ? [predecessorPoint, ...selectedPoints] : selectedPoints;
  if (scopedPoints.some((point) => !isValidPrice(point.priceUsd))) {
    return rejected("invalid-source-price", windowDetail);
  }

  for (let index = 1; index < window.length; index += 1) {
    const expected = window[index - 1]!.timestamp + barIntervalMs;
    const actual = window[index]!.timestamp;
    if (actual !== expected) {
      return rejected(actual > expected ? "missing-minute-bucket" : "nonconsecutive-bars", windowDetail);
    }
  }

  const gapBoundaryStartMs = predecessorPoint ? predecessorPoint.timestampMs : windowStartMs;
  let maximumObservedSourceGapMs = selectedPoints[0]!.timestampMs - gapBoundaryStartMs;
  for (let index = 1; index < selectedPoints.length; index += 1) {
    const gap = selectedPoints[index]!.timestampMs - selectedPoints[index - 1]!.timestampMs;
    maximumObservedSourceGapMs = Math.max(maximumObservedSourceGapMs, gap);
  }
  maximumObservedSourceGapMs = Math.max(
    maximumObservedSourceGapMs,
    timestampMs - selectedPoints[selectedPoints.length - 1]!.timestampMs,
  );

  if (maximumObservedSourceGapMs > maximumSourceGapMs) {
    return rejected("source-gap-exceeded", { ...windowDetail, maximumObservedSourceGapMs });
  }

  const estimate = estimateRealizedVolatility(window, lookbackBars);
  if (!estimate || !Number.isFinite(estimate.annualizedVol)) {
    return rejected("volatility-estimate-unavailable", {
      ...windowDetail,
      maximumObservedSourceGapMs,
    });
  }

  return {
    available: true,
    candles: window,
    annualizedVolatility: estimate.annualizedVol,
    windowStartMs,
    windowEndMs,
    sourcePointCount: selectedPoints.length,
    barCount: window.length,
    maximumObservedSourceGapMs,
    rejectionReason: null,
    includesInProgressMinuteBar,
    futurePointCount,
    duplicatePointCount,
    firstSelectedSourceTimestampMs: selectedPoints[0]!.timestampMs,
    lastSelectedSourceTimestampMs: selectedPoints[selectedPoints.length - 1]!.timestampMs,
  };
}
