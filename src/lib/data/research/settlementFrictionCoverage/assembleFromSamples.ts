/**
 * Assemble report artifacts from precomputed friction samples (empirical CS path).
 */

import { createHash } from "node:crypto";

import {
  aggregateByUtcDay,
  equalDayAggregate,
  pooledSampleAggregate,
  type FrictionSampleRow,
} from "./aggregate";
import type { EligibleCalendarAuthority } from "./eligibleCalendar";
import { assertDayEligible } from "./eligibleCalendar";
import type { ExclusionReason } from "./sampling";
import {
  summarizeSettlementLabelCoverage,
  type SettlementLabelRecord,
} from "./settlementJoin";
import type { DayAvailability, StudyRunResult } from "./runStudy";
import {
  SETTLEMENT_FRICTION_DISCLAIMER,
  SETTLEMENT_FRICTION_HORIZONS_MS,
  assertSettlementFrictionAdapterIdentity,
  assertSettlementFrictionFeeIdentity,
  buildSettlementFrictionConfig,
} from "./types";

export function assembleSettlementFrictionStudyFromSamples(input: {
  calendar: EligibleCalendarAuthority;
  samples: readonly FrictionSampleRow[];
  labels: readonly SettlementLabelRecord[];
  exclusionCounts: Partial<Record<ExclusionReason, number>>;
  expectedFeeContractIdentity: string;
  expectedAdapterIdentity: string;
  codeAuthoritySha: string | null;
  generatedAtUtc: string;
  locallyAvailableUtcDays: readonly string[];
  dayNotes?: readonly DayAvailability[];
}): StudyRunResult {
  assertSettlementFrictionFeeIdentity(input.expectedFeeContractIdentity);
  assertSettlementFrictionAdapterIdentity(input.expectedAdapterIdentity);
  const config = buildSettlementFrictionConfig();

  for (const day of input.locallyAvailableUtcDays) {
    assertDayEligible(day, input.calendar);
  }
  for (const sample of input.samples) {
    assertDayEligible(sample.utcDayKey, input.calendar);
  }

  const samples = [...input.samples].sort((a, b) => {
    if (a.utcDayKey !== b.utcDayKey) return a.utcDayKey.localeCompare(b.utcDayKey);
    if (a.marketTicker !== b.marketTicker) {
      return a.marketTicker.localeCompare(b.marketTicker);
    }
    return a.entryTimestampMs - b.entryTimestampMs;
  });

  const byDay = aggregateByUtcDay(samples, SETTLEMENT_FRICTION_HORIZONS_MS);
  const pooled = pooledSampleAggregate({
    samples,
    horizonsMs: SETTLEMENT_FRICTION_HORIZONS_MS,
  });
  const equalDay = equalDayAggregate({
    daySummaries: byDay,
    horizonsMs: SETTLEMENT_FRICTION_HORIZONS_MS,
  });
  const sampleTickers = [...new Set(samples.map((s) => s.marketTicker))].sort();
  const settlementCoverage = summarizeSettlementLabelCoverage({
    denominatorTickers: sampleTickers,
    labels: input.labels,
  });

  const processedDays = new Set(byDay.map((d) => d.utcDayKey));
  const available = new Set(input.locallyAvailableUtcDays);
  const missingOrRejected: DayAvailability[] = [];
  for (const note of input.dayNotes ?? []) {
    if (note.status === "missing-local" || note.status === "rejected") {
      missingOrRejected.push(note);
    }
  }
  for (const day of input.calendar.eligibleUtcDays) {
    if (processedDays.has(day)) continue;
    if (missingOrRejected.some((d) => d.utcDayKey === day)) continue;
    missingOrRejected.push({
      utcDayKey: day,
      status: available.has(day) ? "rejected" : "missing-local",
      reason: available.has(day)
        ? "local-day-present-but-zero-retained-samples"
        : "local-raw-day-unavailable",
      marketsSeen: 0,
      retainedSamples: 0,
      sessionCoverageNote: "not processed as a complete session",
    });
  }

  const successfullyProcessedUtcDayCount = processedDays.size;
  let completionStatus: StudyRunResult["completionStatus"] = "complete";
  if (successfullyProcessedUtcDayCount === 0) completionStatus = "blocked";
  else if (successfullyProcessedUtcDayCount < input.calendar.eligibleUtcDays.length) {
    completionStatus = "partial";
  }

  const exclusionCounts: Record<ExclusionReason, number> = {
    "missing-prices": 0,
    "crossed-book": 0,
    "locked-book": 0,
    "insufficient-size": 0,
    "stale-quote": 0,
    "missing-quote-age": 0,
    "unresolvable-mid": 0,
    "outside-session": 0,
    "structural-gap": 0,
    ...input.exclusionCounts,
  };

  return {
    config,
    disclaimer: SETTLEMENT_FRICTION_DISCLAIMER,
    codeAuthoritySha: input.codeAuthoritySha,
    generatedAtUtc: input.generatedAtUtc,
    calendar: input.calendar,
    eligibleUtcDayCount: input.calendar.eligibleUtcDays.length,
    locallyAvailableUtcDayCount: input.locallyAvailableUtcDays.length,
    successfullyProcessedUtcDayCount,
    missingOrRejectedUtcDays: missingOrRejected.sort((a, b) =>
      a.utcDayKey.localeCompare(b.utcDayKey),
    ),
    exclusionCounts,
    samples,
    samplesContentSha256: createHash("sha256")
      .update(samples.map((s) => JSON.stringify(s)).join("\n"))
      .digest("hex"),
    byDay,
    pooled,
    equalDay,
    settlementCoverage,
    completionStatus,
  };
}
