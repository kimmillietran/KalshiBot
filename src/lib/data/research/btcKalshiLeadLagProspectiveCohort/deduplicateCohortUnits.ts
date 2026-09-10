import { computeLeadLagEffectiveSampleSize } from "../btcKalshiLeadLagEvidenceContract/statisticalUnit";

import {
  LeadLagProspectiveCohortError,
  type LeadLagCohortDedupResult,
  type LeadLagIndependentUnitRecord,
  type LeadLagProspectiveRunEvidence,
} from "./leadLagProspectiveCohortTypes";

function rangesOverlap(
  leftStart: number | null,
  leftEnd: number | null,
  rightStart: number | null,
  rightEnd: number | null,
): boolean {
  if (
    leftStart === null
    || leftEnd === null
    || rightStart === null
    || rightEnd === null
  ) {
    return false;
  }
  return leftStart <= rightEnd && rightStart <= leftEnd;
}

/**
 * Cross-run statistical deduplication for PR #71 units:
 * - market-day blocks are unique across the cohort
 * - BTC triggers are unique across the cohort
 * Overlapping capture windows are recorded; units still dedupe by identity
 * (fail closed if the same unitId appears with conflicting attributions is not needed —
 * first-seen wins deterministically by sorted runId then unitId).
 */
export function deduplicateProspectiveCohortUnits(
  runs: readonly LeadLagProspectiveRunEvidence[],
): LeadLagCohortDedupResult {
  const sortedRuns = [...runs].sort((left, right) => left.runId.localeCompare(right.runId));
  const rawPerRunEssSum = sortedRuns.reduce((sum, run) => sum + run.essContribution, 0);

  const seenMarketDays = new Set<string>();
  const seenTriggers = new Set<string>();
  const removedUnitIds: string[] = [];
  const retainedMarketDayUnitIds: string[] = [];
  const retainedBtcTriggerUnitIds: string[] = [];

  for (const run of sortedRuns) {
    for (const unit of run.independentUnitRecords) {
      if (unit.unitKind === "market-day-block") {
        if (seenMarketDays.has(unit.unitId)) {
          removedUnitIds.push(unit.unitId);
          continue;
        }
        seenMarketDays.add(unit.unitId);
        retainedMarketDayUnitIds.push(unit.unitId);
      } else if (unit.unitKind === "btc-trigger") {
        if (seenTriggers.has(unit.unitId)) {
          removedUnitIds.push(unit.unitId);
          continue;
        }
        seenTriggers.add(unit.unitId);
        retainedBtcTriggerUnitIds.push(unit.unitId);
      } else {
        throw new LeadLagProspectiveCohortError(`unknown independent unit kind`);
      }
    }
  }

  const overlappingTimeRangePairs: { leftRunId: string; rightRunId: string }[] = [];
  for (let i = 0; i < sortedRuns.length; i += 1) {
    for (let j = i + 1; j < sortedRuns.length; j += 1) {
      const left = sortedRuns[i]!;
      const right = sortedRuns[j]!;
      if (
        rangesOverlap(
          left.captureWindowStartMs,
          left.captureWindowEndMs,
          right.captureWindowStartMs,
          right.captureWindowEndMs,
        )
      ) {
        overlappingTimeRangePairs.push({
          leftRunId: left.runId,
          rightRunId: right.runId,
        });
      }
    }
  }

  const deduplicatedCohortEss = computeLeadLagEffectiveSampleSize({
    rawObservationCount: retainedMarketDayUnitIds.length,
    independentMarketCount: new Set(
      retainedMarketDayUnitIds.map((id) => id.split(":")[0] ?? id),
    ).size,
    marketDayCount: retainedMarketDayUnitIds.length,
    uniqueBtcTriggerCount: retainedBtcTriggerUnitIds.length,
  });

  retainedMarketDayUnitIds.sort((a, b) => a.localeCompare(b));
  retainedBtcTriggerUnitIds.sort((a, b) => a.localeCompare(b));
  removedUnitIds.sort((a, b) => a.localeCompare(b));
  overlappingTimeRangePairs.sort((left, right) => {
    const byLeft = left.leftRunId.localeCompare(right.leftRunId);
    return byLeft !== 0 ? byLeft : left.rightRunId.localeCompare(right.rightRunId);
  });

  return {
    rawPerRunEssSum,
    deduplicatedCohortEss:
      retainedMarketDayUnitIds.length === 0 && retainedBtcTriggerUnitIds.length === 0
        ? 0
        : deduplicatedCohortEss,
    duplicateOrDependentUnitsRemoved: removedUnitIds.length,
    retainedMarketDayUnitIds,
    retainedBtcTriggerUnitIds,
    removedUnitIds,
    overlappingTimeRangePairs,
  };
}

export function buildIndependentUnitRecordsFromSets(input: {
  runId: string;
  marketDayUnitIds: readonly string[];
  btcTriggerUnitIds: readonly string[];
  captureWindowStartMs: number | null;
  captureWindowEndMs: number | null;
}): LeadLagIndependentUnitRecord[] {
  const records: LeadLagIndependentUnitRecord[] = [];
  for (const unitId of [...input.marketDayUnitIds].sort((a, b) => a.localeCompare(b))) {
    const [marketTicker, tradingDayUtc] = unitId.split(":");
    records.push({
      unitKind: "market-day-block",
      unitId,
      marketTicker,
      tradingDayUtc,
      observedInRunId: input.runId,
      captureWindowStartMs: input.captureWindowStartMs,
      captureWindowEndMs: input.captureWindowEndMs,
    });
  }
  for (const unitId of [...input.btcTriggerUnitIds].sort((a, b) => a.localeCompare(b))) {
    records.push({
      unitKind: "btc-trigger",
      unitId,
      btcTriggerId: unitId,
      observedInRunId: input.runId,
      captureWindowStartMs: input.captureWindowStartMs,
      captureWindowEndMs: input.captureWindowEndMs,
    });
  }
  return records;
}
