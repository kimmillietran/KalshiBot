import { averageFinite, percentile } from "@/lib/utils/stats";

import { safeShare } from "../calibrationFadeForwardValidation/calibrationFadeForwardValidationUtils";

import type {
  BtcSourceDiagnostics,
  GapExample,
  ThresholdBinStats,
} from "./causalFeatureEquivalenceAuditTypes";

export type RawBtcDiagnosticPoint = {
  timestampMs: number;
  priceUsd: number;
};

const THRESHOLD_SPECS: readonly { thresholdMs: number; comparison: "<=" | ">" }[] = [
  { thresholdMs: 5000, comparison: "<=" },
  { thresholdMs: 5000, comparison: ">" },
  { thresholdMs: 5001, comparison: ">" },
  { thresholdMs: 5100, comparison: ">" },
  { thresholdMs: 5500, comparison: ">" },
  { thresholdMs: 6000, comparison: ">" },
];

/**
 * O(M log M) sort then O(M) interval / duplicate / threshold diagnostics.
 * Threshold bins use exact comparisons — no rounding before classification.
 */
export function buildBtcSourceDiagnostics(
  points: readonly RawBtcDiagnosticPoint[],
): BtcSourceDiagnostics {
  const sourceRecordCount = points.length;
  let finiteTimestampCount = 0;
  let finitePositivePriceCount = 0;
  let invalidPriceCount = 0;

  for (const point of points) {
    if (Number.isFinite(point.timestampMs)) {
      finiteTimestampCount += 1;
    }
    if (Number.isFinite(point.priceUsd) && point.priceUsd > 0) {
      finitePositivePriceCount += 1;
    } else {
      invalidPriceCount += 1;
    }
  }

  const sortable = points.filter((point) => Number.isFinite(point.timestampMs));
  const sorted = [...sortable].sort((left, right) => left.timestampMs - right.timestampMs);

  let outOfOrderCount = 0;
  for (let index = 1; index < points.length; index += 1) {
    const prev = points[index - 1]!;
    const curr = points[index]!;
    if (
      Number.isFinite(prev.timestampMs)
      && Number.isFinite(curr.timestampMs)
      && curr.timestampMs < prev.timestampMs
    ) {
      outOfOrderCount += 1;
    }
  }

  let exactDuplicateTimestampCount = 0;
  let conflictingDuplicateTimestampCount = 0;
  for (let index = 1; index < sorted.length; index += 1) {
    const prev = sorted[index - 1]!;
    const curr = sorted[index]!;
    if (curr.timestampMs === prev.timestampMs) {
      if (Object.is(curr.priceUsd, prev.priceUsd)) {
        exactDuplicateTimestampCount += 1;
      } else {
        conflictingDuplicateTimestampCount += 1;
      }
    }
  }

  const intervals: number[] = [];
  const gapExamples: GapExample[] = [];
  for (let index = 1; index < sorted.length; index += 1) {
    const prev = sorted[index - 1]!;
    const curr = sorted[index]!;
    if (curr.timestampMs === prev.timestampMs) {
      continue;
    }
    const gapMs = curr.timestampMs - prev.timestampMs;
    intervals.push(gapMs);
    gapExamples.push({
      fromTimestampMs: prev.timestampMs,
      toTimestampMs: curr.timestampMs,
      gapMs,
    });
  }

  const sortedIntervals = [...intervals].sort((left, right) => left - right);
  const thresholdBins: ThresholdBinStats[] = THRESHOLD_SPECS.map((spec) => {
    const count =
      spec.comparison === "<="
        ? intervals.filter((gap) => gap <= spec.thresholdMs).length
        : intervals.filter((gap) => gap > spec.thresholdMs).length;
    return {
      thresholdMs: spec.thresholdMs,
      comparison: spec.comparison,
      count,
      share: safeShare(count, intervals.length),
    };
  });

  const longestGapExamples = [...gapExamples]
    .sort((left, right) => right.gapMs - left.gapMs || left.fromTimestampMs - right.fromTimestampMs)
    .slice(0, 5);

  const firstTimestampMs = sorted[0]?.timestampMs ?? null;
  const lastTimestampMs = sorted[sorted.length - 1]?.timestampMs ?? null;

  return {
    sourceRecordCount,
    firstTimestampMs,
    lastTimestampMs,
    durationMs:
      firstTimestampMs !== null && lastTimestampMs !== null
        ? lastTimestampMs - firstTimestampMs
        : null,
    finiteTimestampCount,
    finitePositivePriceCount,
    invalidPriceCount,
    outOfOrderCount,
    exactDuplicateTimestampCount,
    conflictingDuplicateTimestampCount,
    observedIntervalCount: intervals.length,
    minimumIntervalMs: sortedIntervals[0] ?? null,
    maximumIntervalMs: sortedIntervals[sortedIntervals.length - 1] ?? null,
    meanIntervalMs: averageFinite(intervals),
    p50IntervalMs: sortedIntervals.length ? percentile(sortedIntervals, 50) : null,
    p75IntervalMs: sortedIntervals.length ? percentile(sortedIntervals, 75) : null,
    p90IntervalMs: sortedIntervals.length ? percentile(sortedIntervals, 90) : null,
    p95IntervalMs: sortedIntervals.length ? percentile(sortedIntervals, 95) : null,
    p99IntervalMs: sortedIntervals.length ? percentile(sortedIntervals, 99) : null,
    thresholdBins,
    longestGapExamples,
    runStartBoundaryCoverageMs: firstTimestampMs,
    runEndBoundaryCoverageMs: lastTimestampMs,
  };
}
