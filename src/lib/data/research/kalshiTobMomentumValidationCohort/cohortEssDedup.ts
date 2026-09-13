import { computeMomentumEffectiveSampleSize as computeKeyMomentumEss } from "../momentumEvidenceContract";

import { parseMomentumIndependentUnitKey } from "./blindIncidenceCounter";
import type {
  MomentumValidationAcceptedSegment,
  MomentumValidationCohortDedupResult,
} from "./momentumValidationCohortTypes";

/**
 * Cross-segment statistical deduplication:
 * at most one independent unit per marketTicker × UTC day × candidateId.
 * Cohort ESS is recomputed over retained keys — not the sum of per-segment ESS.
 */
export function deduplicateMomentumValidationCohortUnits(
  segments: readonly MomentumValidationAcceptedSegment[],
): MomentumValidationCohortDedupResult {
  const ordered = [...segments].sort((left, right) => {
    if (left.captureStartMs !== right.captureStartMs) {
      return left.captureStartMs - right.captureStartMs;
    }
    return left.runId.localeCompare(right.runId);
  });

  const rawPerSegmentEssSum = ordered.reduce(
    (sum, segment) => sum + segment.blindIncidence.independentEss,
    0,
  );

  const seen = new Set<string>();
  const retainedUnitIds: string[] = [];
  const removedUnitIds: string[] = [];

  for (const segment of ordered) {
    const unitIds = [...segment.independentUnitIds].sort((a, b) => a.localeCompare(b));
    for (const unitId of unitIds) {
      if (seen.has(unitId)) {
        removedUnitIds.push(unitId);
        continue;
      }
      seen.add(unitId);
      retainedUnitIds.push(unitId);
    }
  }

  const deduplicatedCohortEss = computeKeyMomentumEss(
    retainedUnitIds.map((unitId) => {
      const parsed = parseMomentumIndependentUnitKey(unitId);
      return {
        marketTicker: parsed.marketTicker,
        calendarDay: parsed.tradingDayUtc,
        structuralCellId: parsed.candidateId,
        usable: true,
      };
    }),
  );

  retainedUnitIds.sort((a, b) => a.localeCompare(b));
  removedUnitIds.sort((a, b) => a.localeCompare(b));

  return {
    rawPerSegmentEssSum,
    deduplicatedCohortEss,
    duplicateOrDependentUnitsRemoved: removedUnitIds.length,
    retainedUnitIds,
    removedUnitIds,
  };
}
