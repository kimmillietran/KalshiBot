import type {
  CalibrationFadeCalibrationMetrics,
  CalibrationFadeExecutableMetrics,
  CalibrationFadeSettlementCoverage,
} from "@/lib/data/research/calibrationFadeForwardValidation/calibrationFadeForwardValidationTypes";

import type {
  CrossRunRunSummary,
  UniqueCandidateMarket,
} from "./calibrationFadeCrossRunValidationTypes";

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

function safeShare(numerator: number, denominator: number): number | null {
  if (denominator <= 0) {
    return null;
  }
  return Math.round((numerator / denominator) * 10_000) / 10_000;
}

/** Aggregates unique-market calibration, executable, and settlement metrics. */
export function aggregateCrossRunMetrics(input: {
  uniqueMarkets: readonly UniqueCandidateMarket[];
  perRunSummaries: readonly CrossRunRunSummary[];
}): {
  calibration: CalibrationFadeCalibrationMetrics;
  executable: CalibrationFadeExecutableMetrics;
  settlementCoverage: CalibrationFadeSettlementCoverage;
  executableEntryAvailableCount: number;
  settlementJoinedCount: number;
  evaluatedExecutableCandidateCount: number;
  unavailableExecutablePriceCount: number;
  missingSettlementMarkets: { marketTicker: string; selectedRunId: string }[];
  recommendedBackfillRunIds: string[];
  runContributions: {
    selectedRunId: string;
    shareOfCandidates: number | null;
    shareOfFeeAdjustedReturn: number | null;
    candidatesPerCaptureHour: number | null;
    candidatesPerThousandObservations: number | null;
  }[];
} {
  const evaluatedMarkets = input.uniqueMarkets.filter((market) => market.evaluated);
  const settled = evaluatedMarkets.filter(
    (market) =>
      market.selectedCanonicalEntry.settledOutcome === "yes"
      || market.selectedCanonicalEntry.settledOutcome === "no",
  );
  const executableAvailable = evaluatedMarkets.filter(
    (market) => market.selectedCanonicalEntry.executableAvailable,
  );
  const evaluatedExecutable = settled.filter(
    (market) => market.selectedCanonicalEntry.executableAvailable,
  );

  const implied = settled.map((market) => market.selectedCanonicalEntry.impliedYesProbability);
  const yesRate =
    settled.length > 0
      ? settled.filter((market) => market.selectedCanonicalEntry.settledOutcome === "yes").length
        / settled.length
      : null;
  const meanImplied = mean(implied);
  const calibrationGap =
    meanImplied !== null && yesRate !== null ? meanImplied - yesRate : null;
  const targetRate =
    settled.length > 0
      ? settled.filter((market) => market.selectedCanonicalEntry.settledOutcome === "no").length
        / settled.length
      : null;

  const brier =
    settled.length > 0
      ? mean(
          settled.map((market) => {
            const outcome = market.selectedCanonicalEntry.settledOutcome === "yes" ? 1 : 0;
            const probability = Math.min(
              Math.max(market.selectedCanonicalEntry.impliedYesProbability, 1e-6),
              1 - 1e-6,
            );
            return (probability - outcome) ** 2;
          }),
        )
      : null;
  const logLoss =
    settled.length > 0
      ? mean(
          settled.map((market) => {
            const outcome = market.selectedCanonicalEntry.settledOutcome === "yes" ? 1 : 0;
            const probability = Math.min(
              Math.max(market.selectedCanonicalEntry.impliedYesProbability, 1e-6),
              1 - 1e-6,
            );
            return -(outcome * Math.log(probability) + (1 - outcome) * Math.log(1 - probability));
          }),
        )
      : null;

  const chronological = [...evaluatedExecutable].sort(
    (left, right) =>
      Date.parse(left.selectedCanonicalEntry.entryTimestamp)
      - Date.parse(right.selectedCanonicalEntry.entryTimestamp),
  );
  const grossReturns = chronological.map(
    (market) => market.selectedCanonicalEntry.grossReturnCents ?? 0,
  );
  const feeReturns = chronological.map(
    (market) => market.selectedCanonicalEntry.feeAdjustedReturnCents ?? 0,
  );
  let cumulative = 0;
  let peak = 0;
  let maxDrawdown = 0;
  for (const value of feeReturns) {
    cumulative += value;
    peak = Math.max(peak, cumulative);
    maxDrawdown = Math.max(maxDrawdown, peak - cumulative);
  }

  const missingSettlementMarkets = evaluatedMarkets
    .filter(
      (market) =>
        market.selectedCanonicalEntry.settledOutcome !== "yes"
        && market.selectedCanonicalEntry.settledOutcome !== "no",
    )
    .map((market) => ({
      marketTicker: market.marketTicker,
      selectedRunId: market.selectedCanonicalEntry.selectedRunId,
    }));

  const recommendedBackfillRunIds = [
    ...new Set(missingSettlementMarkets.map((entry) => entry.selectedRunId)),
  ].sort((left, right) => left.localeCompare(right));

  const totalFee = feeReturns.reduce((sum, value) => sum + value, 0);
  const uniqueByCanonicalRun = new Map<string, number>();
  for (const market of evaluatedMarkets) {
    const runId = market.selectedCanonicalEntry.selectedRunId;
    uniqueByCanonicalRun.set(runId, (uniqueByCanonicalRun.get(runId) ?? 0) + 1);
  }

  const runContributions = input.perRunSummaries.map((run) => {
    const introduced = uniqueByCanonicalRun.get(run.selectedRunId) ?? 0;
    const hours =
      run.runDurationSeconds !== null && run.runDurationSeconds > 0
        ? run.runDurationSeconds / 3600
        : null;
    return {
      selectedRunId: run.selectedRunId,
      shareOfCandidates: safeShare(introduced, evaluatedMarkets.length),
      shareOfFeeAdjustedReturn:
        run.feeAdjustedReturnCents !== null && feeReturns.length > 0
          ? safeShare(run.feeAdjustedReturnCents, Math.abs(totalFee) > 0 ? totalFee : 1)
          : null,
      candidatesPerCaptureHour:
        hours !== null ? Math.round((introduced / hours) * 10_000) / 10_000 : null,
      candidatesPerThousandObservations:
        run.recordsScanned > 0
          ? Math.round((introduced / (run.recordsScanned / 1000)) * 10_000) / 10_000
          : null,
    };
  });

  return {
    calibration: {
      qualifyingObservationCount: input.perRunSummaries.reduce(
        (sum, run) => sum + run.qualifyingObservationCount,
        0,
      ),
      candidateEpisodeCount: input.perRunSummaries.reduce(
        (sum, run) => sum + run.candidateEpisodeCount,
        0,
      ),
      candidateMarketCount: evaluatedMarkets.length,
      meanImpliedYesProbability: meanImplied,
      meanTargetSideProbability: targetRate,
      observedYesSettlementRate: yesRate,
      observedTargetSideSettlementRate: targetRate,
      calibrationGap,
      signedCalibrationGap: calibrationGap,
      brierScore: brier,
      logLoss,
      marketLevelSignedCalibrationGap: calibrationGap,
      descriptiveObservationSignedGap: null,
    },
    executable: {
      executableCandidateCount: evaluatedExecutable.length,
      evaluatedExecutableCandidateCount: evaluatedExecutable.length,
      executableEntryAvailableCount: executableAvailable.length,
      unavailableExecutablePriceCount: evaluatedMarkets.length - executableAvailable.length,
      grossReturnCents: grossReturns.length ? grossReturns.reduce((a, b) => a + b, 0) : null,
      feeAdjustedReturnCents: feeReturns.length ? feeReturns.reduce((a, b) => a + b, 0) : null,
      winRate:
        evaluatedExecutable.length > 0
          ? evaluatedExecutable.filter(
              (market) => (market.selectedCanonicalEntry.feeAdjustedReturnCents ?? 0) > 0,
            ).length / evaluatedExecutable.length
          : null,
      averageEntryPriceCents: mean(
        evaluatedExecutable.map((market) => market.selectedCanonicalEntry.noAskCents ?? 0),
      ),
      medianEntryPriceCents: median(
        evaluatedExecutable.map((market) => market.selectedCanonicalEntry.noAskCents ?? 0),
      ),
      maximumDrawdownCents: feeReturns.length ? maxDrawdown : null,
      cumulativeReturnCents: feeReturns.length ? cumulative : null,
    },
    settlementCoverage: {
      candidateMarketCount: evaluatedMarkets.length,
      settledCandidateMarketCount: settled.length,
      joinedCandidateMarketCount: settled.length,
      unresolvedCandidateMarketCount: evaluatedMarkets.length - settled.length,
      settlementCoverageShare: safeShare(settled.length, evaluatedMarkets.length),
      excludedByReason: {
        unresolved: evaluatedMarkets.length - settled.length,
        conflicting: input.uniqueMarkets.filter((market) => market.conflicting).length,
      },
    },
    executableEntryAvailableCount: executableAvailable.length,
    settlementJoinedCount: settled.length,
    evaluatedExecutableCandidateCount: evaluatedExecutable.length,
    unavailableExecutablePriceCount: evaluatedMarkets.length - executableAvailable.length,
    missingSettlementMarkets,
    recommendedBackfillRunIds,
    runContributions,
  };
}
