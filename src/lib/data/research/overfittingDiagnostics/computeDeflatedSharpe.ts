import type { ParsedStrategyAggregateSummary } from "../leaderboard/strategyLeaderboardTypes";

import type {
  DeflatedSharpeDiagnostic,
  DeflatedSharpeEntry,
} from "./overfittingDiagnosticsTypes";

/**
 * Approximates expected maximum Sharpe ratio under null with N independent trials.
 * Simplified hair-cut from Bailey-López de Prado (2014) for registry-wide screening.
 */
export function approximateExpectedMaxSharpeUnderNull(trialCount: number): number | null {
  if (trialCount <= 1) {
    return null;
  }
  return Math.sqrt(2 * Math.log(trialCount));
}

function buildDeflatedSharpeEntry(
  summary: ParsedStrategyAggregateSummary,
  expectedMaxSharpe: number | null,
): DeflatedSharpeEntry {
  const observedSharpeRatio = summary.performance.sharpeRatio;
  const sampleSize = summary.marketCounts.completed;

  const deflatedSharpeApproximation =
    observedSharpeRatio !== null && expectedMaxSharpe !== null
      ? observedSharpeRatio - expectedMaxSharpe
      : null;

  return {
    strategyId: summary.strategyId,
    observedSharpeRatio,
    expectedMaxSharpeUnderNull: expectedMaxSharpe,
    deflatedSharpeApproximation,
    sampleSize,
  };
}

export function buildDeflatedSharpeDiagnostic(
  summaries: readonly ParsedStrategyAggregateSummary[],
  trialsCount: number,
): DeflatedSharpeDiagnostic {
  const warnings: string[] = [];
  const strategiesWithSharpe = summaries.filter(
    (summary) => summary.performance.sharpeRatio !== null,
  );

  if (strategiesWithSharpe.length === 0) {
    return {
      status: "unavailable",
      trialsCount: null,
      strategies: summaries.map((summary) =>
        buildDeflatedSharpeEntry(summary, null),
      ),
      warnings: [
        "No Sharpe ratio data found in aggregate summaries; deflated Sharpe cannot be approximated.",
      ],
    };
  }

  if (trialsCount <= 1) {
    warnings.push(
      "Deflated Sharpe approximation requires multiple trials; only one strategy family was evaluated.",
    );
    return {
      status: "unavailable",
      trialsCount,
      strategies: [...summaries]
        .sort((left, right) => left.strategyId.localeCompare(right.strategyId))
        .map((summary) => buildDeflatedSharpeEntry(summary, null)),
      warnings,
    };
  }

  const expectedMaxSharpe = approximateExpectedMaxSharpeUnderNull(trialsCount);
  warnings.push(
    "Deflated Sharpe uses a simplified expected-max-Sharpe approximation; not a full Bailey-López de Prado DSR.",
  );

  return {
    status: "computed",
    trialsCount,
    strategies: [...summaries]
      .sort((left, right) => left.strategyId.localeCompare(right.strategyId))
      .map((summary) => buildDeflatedSharpeEntry(summary, expectedMaxSharpe)),
    warnings,
  };
}
