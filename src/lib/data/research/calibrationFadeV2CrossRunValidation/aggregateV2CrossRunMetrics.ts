import { aggregateCrossRunMetrics } from "../calibrationFadeCrossRunValidation/aggregateCrossRunMetrics";
import type { CrossRunRunSummary, UniqueCandidateMarket } from "../calibrationFadeCrossRunValidation/calibrationFadeCrossRunValidationTypes";
import type { CalibrationFadeExecutableMetrics } from "../calibrationFadeForwardValidation/calibrationFadeForwardValidationTypes";

import {
  assertV2ExecutableReturnPairIntegrity,
  isV2ExecutableReturnEvaluable,
} from "./v2ExecutableReturnIntegrity";

function mean(values: readonly number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function median(values: readonly number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[middle - 1]! + sorted[middle]!) / 2;
  }
  return sorted[middle]!;
}

/**
 * v2 aggregation seam: reuse shared calibration/settlement metrics, then replace
 * executable P&L with return-evaluable markets only. Null returns stay unknown.
 */
export function aggregateV2CrossRunMetrics(input: {
  uniqueMarkets: readonly UniqueCandidateMarket[];
  perRunSummaries: readonly CrossRunRunSummary[];
}): ReturnType<typeof aggregateCrossRunMetrics> {
  for (const market of input.uniqueMarkets) {
    assertV2ExecutableReturnPairIntegrity(
      market.selectedCanonicalEntry,
      `Canonical market ${market.marketTicker}`,
    );
  }

  const shared = aggregateCrossRunMetrics(input);
  const evaluatedMarkets = input.uniqueMarkets.filter((market) => market.evaluated);
  const executableEntryAvailable = evaluatedMarkets.filter(
    (market) => market.selectedCanonicalEntry.executableAvailable,
  );
  const evaluatedExecutable = evaluatedMarkets.filter((market) => {
    const entry = market.selectedCanonicalEntry;
    return (
      (entry.settledOutcome === "yes" || entry.settledOutcome === "no")
      && isV2ExecutableReturnEvaluable(entry)
    );
  });

  const chronological = [...evaluatedExecutable].sort(
    (left, right) =>
      Date.parse(left.selectedCanonicalEntry.entryTimestamp)
      - Date.parse(right.selectedCanonicalEntry.entryTimestamp),
  );
  const grossReturns = chronological.map((market) => market.selectedCanonicalEntry.grossReturnCents);
  const feeReturns = chronological.map((market) => market.selectedCanonicalEntry.feeAdjustedReturnCents);
  if (grossReturns.some((value) => value === null) || feeReturns.some((value) => value === null)) {
    throw new Error("v2 executable seam encountered a null return after evaluability filter");
  }
  const finiteGross = grossReturns as number[];
  const finiteFee = feeReturns as number[];

  let cumulative = 0;
  let peak = 0;
  let maxDrawdown = 0;
  for (const value of finiteFee) {
    cumulative += value;
    peak = Math.max(peak, cumulative);
    maxDrawdown = Math.max(maxDrawdown, peak - cumulative);
  }

  const executable: CalibrationFadeExecutableMetrics = {
    executableCandidateCount: evaluatedExecutable.length,
    evaluatedExecutableCandidateCount: evaluatedExecutable.length,
    executableEntryAvailableCount: executableEntryAvailable.length,
    unavailableExecutablePriceCount: evaluatedMarkets.length - executableEntryAvailable.length,
    grossReturnCents: finiteGross.length ? finiteGross.reduce((sum, value) => sum + value, 0) : null,
    feeAdjustedReturnCents: finiteFee.length ? finiteFee.reduce((sum, value) => sum + value, 0) : null,
    winRate:
      evaluatedExecutable.length > 0
        ? evaluatedExecutable.filter(
            (market) => (market.selectedCanonicalEntry.feeAdjustedReturnCents as number) > 0,
          ).length / evaluatedExecutable.length
        : null,
    averageEntryPriceCents: mean(
      evaluatedExecutable.map((market) => market.selectedCanonicalEntry.noAskCents).filter(
        (value): value is number => value !== null && Number.isFinite(value),
      ),
    ),
    medianEntryPriceCents: median(
      evaluatedExecutable.map((market) => market.selectedCanonicalEntry.noAskCents).filter(
        (value): value is number => value !== null && Number.isFinite(value),
      ),
    ),
    maximumDrawdownCents: finiteFee.length ? maxDrawdown : null,
    cumulativeReturnCents: finiteFee.length ? cumulative : null,
  };

  return {
    ...shared,
    executable,
    executableEntryAvailableCount: executable.executableEntryAvailableCount,
    evaluatedExecutableCandidateCount: executable.evaluatedExecutableCandidateCount,
    unavailableExecutablePriceCount: executable.unavailableExecutablePriceCount,
  };
}
