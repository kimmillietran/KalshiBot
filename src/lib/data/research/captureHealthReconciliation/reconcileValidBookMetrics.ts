import type { ParsedTopOfBookRecord } from "@/lib/data/research/captureHealthAudit/captureHealthAuditTypes";
import {
  accumulateTopOfBookRecord,
  createEmptyRunTopOfBookStats,
  validBookShare,
} from "@/lib/data/research/forwardCaptureReadiness/runTopOfBookStats";
import type { ParsedTopOfBookRecord as ReadinessTopOfBookRecord } from "@/lib/data/research/forwardCaptureReadiness/loadForwardCaptureRuns";

import type { ValidBookMetricReconciliation } from "./captureHealthReconciliationTypes";

function roundShare(numerator: number, denominator: number): number | null {
  if (denominator <= 0) {
    return null;
  }

  return Math.round((numerator / denominator) * 10_000) / 10_000;
}

function toReadinessRecord(record: ParsedTopOfBookRecord): ReadinessTopOfBookRecord {
  return {
    marketTicker: record.marketTicker,
    eventTicker: record.eventTicker,
    seriesTicker: record.seriesTicker ?? undefined,
    receivedAtLocal: record.receivedAtLocal,
    bookState: record.bookState,
    yesBestBidCents: record.yesBestBidCents,
    yesBestAskCents: record.yesBestAskCents,
    yesSpreadCents: record.yesSpreadCents,
    noSpreadCents: record.noSpreadCents,
    isEconomicallyValid: undefined,
    isParityUsable: undefined,
  };
}

/** Reconciles valid-book metrics with explicit populations and denominators. */
export function reconcileValidBookMetrics(input: {
  topOfBookRecords: readonly ParsedTopOfBookRecord[];
  aggregateForwardReadinessValidShare: number | null;
}): ValidBookMetricReconciliation[] {
  const total = input.topOfBookRecords.length;
  const rawValidCount = input.topOfBookRecords.filter((record) => record.bookState === "valid").length;
  const gapDetectedCount = input.topOfBookRecords.filter(
    (record) => record.bookState === "gap-detected",
  ).length;

  const stats = createEmptyRunTopOfBookStats();
  let previousTimestampMs: number | null = null;
  for (const record of input.topOfBookRecords) {
    previousTimestampMs = accumulateTopOfBookRecord(
      stats,
      toReadinessRecord(record),
      previousTimestampMs,
    );
  }

  const researchEligibleShare = validBookShare(stats);
  const parityUsableCount = stats.parityUsableRecordCount;

  return [
    {
      metricId: "rawTopOfBookValidShare",
      label: "Raw top-of-book valid share",
      value: roundShare(rawValidCount, total),
      numerator: rawValidCount,
      denominator: total,
      population: "all emitted top-of-book records for selected run",
      filters: ["bookState === valid"],
      excludedRecordCount: total - rawValidCount,
      exclusionReasons: ["bookState !== valid"],
      sourceArtifact: "top-of-book.jsonl",
      sourceModule: "captureHealthAudit.computeCaptureHealthMetrics",
      replacesAmbiguousField: "validBookShare (capture-health-audit)",
    },
    {
      metricId: "researchEligibleValidShare",
      label: "Research-eligible valid share",
      value: researchEligibleShare,
      numerator: stats.economicallyValidRecordCount > 0
        ? stats.economicallyValidRecordCount
        : stats.validRecordCount,
      denominator: total,
      population: "all emitted top-of-book records for selected run",
      filters: [
        "isEconomicallyValid when present, else bookState === valid",
      ],
      excludedRecordCount:
        total
        - (stats.economicallyValidRecordCount > 0
          ? stats.economicallyValidRecordCount
          : stats.validRecordCount),
      exclusionReasons: ["not economically valid / not bookState valid"],
      sourceArtifact: "top-of-book.jsonl",
      sourceModule: "forwardCaptureReadiness.validBookShare",
      replacesAmbiguousField: "validBookShare (forward-capture-readiness single-run)",
    },
    {
      metricId: "postSnapshotValidShare",
      label: "Post-snapshot valid share proxy",
      value: roundShare(rawValidCount, Math.max(total - gapDetectedCount, 1)),
      numerator: rawValidCount,
      denominator: Math.max(total - gapDetectedCount, 0),
      population: "top-of-book records excluding gap-detected rows",
      filters: ["bookState === valid", "bookState !== gap-detected"],
      excludedRecordCount: gapDetectedCount + (total - rawValidCount),
      exclusionReasons: ["gap-detected", "bookState !== valid"],
      sourceArtifact: "top-of-book.jsonl",
      sourceModule: "captureHealthReconciliation",
      replacesAmbiguousField: null,
    },
    {
      metricId: "aggregateForwardReadinessValidShare",
      label: "Forward readiness aggregate valid share (reference)",
      value: input.aggregateForwardReadinessValidShare,
      numerator: 0,
      denominator: 0,
      population: "multi-run aggregate from forward-capture-readiness (may include other runs)",
      filters: ["aggregate across discovered capture-health runs"],
      excludedRecordCount: 0,
      exclusionReasons: [],
      sourceArtifact: "data/research-results/forward-capture-readiness.json",
      sourceModule: "evaluateForwardCaptureReadiness.buildAggregateMetrics",
      replacesAmbiguousField: "validBookShare (forward-capture-readiness aggregate)",
    },
    {
      metricId: "parityUsableShare",
      label: "Parity-usable share",
      value: roundShare(parityUsableCount, total),
      numerator: parityUsableCount,
      denominator: total,
      population: "all emitted top-of-book records for selected run",
      filters: ["isParityUsable when present, else economically valid fallback"],
      excludedRecordCount: total - parityUsableCount,
      exclusionReasons: ["not parity usable"],
      sourceArtifact: "top-of-book.jsonl",
      sourceModule: "forwardCaptureReadiness.runTopOfBookStats",
      replacesAmbiguousField: null,
    },
  ];
}
