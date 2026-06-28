import type { BacktestMetricsSummary } from "@/lib/data/backtesting/metricsTypes";
import { fnv1a32, stableStringify } from "@/lib/trading/config/hashConfig";

import type { ResearchExperimentResultWithMetrics } from "./comparisonTypes";
import {
  COMPARISON_METRIC_ORDER,
  ComparisonMetricId,
  ResearchComparisonError,
  ResearchComparisonErrorCode,
} from "./comparisonTypes";
import type {
  ComparisonMetricTableRow,
  ComparisonMetricValues,
  ComparisonSummary,
  ComparisonTieGroup,
  MetricDominanceEntry,
  RankedExperiment,
  ResearchComparison,
} from "./comparisonTypes";

type ComparableExperiment = ResearchExperimentResultWithMetrics & {
  comparisonMetrics: ComparisonMetricValues;
};

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object") {
    return value;
  }

  Object.freeze(value);

  if (Array.isArray(value)) {
    for (const item of value) {
      deepFreeze(item);
    }
  } else {
    for (const nested of Object.values(value)) {
      deepFreeze(nested);
    }
  }

  return value;
}

function extractComparisonMetrics(
  metrics: BacktestMetricsSummary,
): ComparisonMetricValues {
  return {
    finalEquityCents: metrics.endEquityCents,
    totalReturnPct: metrics.totalReturnPct,
    cagrPct: metrics.annualizedReturnPct,
    sharpeRatio: metrics.sharpeRatio,
    maxDrawdownPct: metrics.maxDrawdownPct,
    profitFactor: metrics.profitFactor,
    winRatePct: metrics.winRatePct,
    expectancyCents: metrics.expectancyCents,
    tradeCount: metrics.tradeCount,
  };
}

function validateMetrics(metrics: BacktestMetricsSummary, experimentId: string): void {
  const requiredNumbers = [
    metrics.endEquityCents,
    metrics.totalReturnPct,
    metrics.maxDrawdownPct,
    metrics.winRatePct,
    metrics.expectancyCents,
    metrics.tradeCount,
  ];

  for (const value of requiredNumbers) {
    if (!Number.isFinite(value)) {
      throw new ResearchComparisonError(
        ResearchComparisonErrorCode.INVALID_EXPERIMENT_METRICS,
        { experimentId },
      );
    }
  }

  if (metrics.tradeCount < 0) {
    throw new ResearchComparisonError(
      ResearchComparisonErrorCode.INVALID_EXPERIMENT_METRICS,
      { experimentId },
    );
  }

  if (
    metrics.sharpeRatio !== null &&
    !Number.isFinite(metrics.sharpeRatio)
  ) {
    throw new ResearchComparisonError(
      ResearchComparisonErrorCode.INVALID_EXPERIMENT_METRICS,
      { experimentId },
    );
  }

  if (
    metrics.annualizedReturnPct !== null &&
    !Number.isFinite(metrics.annualizedReturnPct)
  ) {
    throw new ResearchComparisonError(
      ResearchComparisonErrorCode.INVALID_EXPERIMENT_METRICS,
      { experimentId },
    );
  }

  if (
    metrics.profitFactor !== null &&
    !Number.isFinite(metrics.profitFactor)
  ) {
    throw new ResearchComparisonError(
      ResearchComparisonErrorCode.INVALID_EXPERIMENT_METRICS,
      { experimentId },
    );
  }
}

function validateExperiments(
  experiments: readonly ResearchExperimentResultWithMetrics[],
): ComparableExperiment[] {
  if (experiments.length === 0) {
    throw new ResearchComparisonError(
      ResearchComparisonErrorCode.EMPTY_EXPERIMENTS,
    );
  }

  const seenIds = new Set<string>();
  const comparable: ComparableExperiment[] = [];

  for (const experiment of experiments) {
    if (experiment.status !== "completed") {
      throw new ResearchComparisonError(
        ResearchComparisonErrorCode.INVALID_EXPERIMENT_STATUS,
        { experimentId: experiment.experimentId },
      );
    }

    if (seenIds.has(experiment.experimentId)) {
      throw new ResearchComparisonError(
        ResearchComparisonErrorCode.DUPLICATE_EXPERIMENT_ID,
        { experimentId: experiment.experimentId },
      );
    }
    seenIds.add(experiment.experimentId);

    validateMetrics(experiment.metrics, experiment.experimentId);

    comparable.push({
      ...experiment,
      comparisonMetrics: extractComparisonMetrics(experiment.metrics),
    });
  }

  return comparable;
}

function compareSharpe(
  left: number | null,
  right: number | null,
): number {
  const leftValue = left ?? Number.NEGATIVE_INFINITY;
  const rightValue = right ?? Number.NEGATIVE_INFINITY;
  return rightValue - leftValue;
}

function compareOverall(
  left: ComparableExperiment,
  right: ComparableExperiment,
): number {
  const leftMetrics = left.comparisonMetrics;
  const rightMetrics = right.comparisonMetrics;

  if (leftMetrics.finalEquityCents !== rightMetrics.finalEquityCents) {
    return rightMetrics.finalEquityCents - leftMetrics.finalEquityCents;
  }

  const sharpeCompare = compareSharpe(
    leftMetrics.sharpeRatio,
    rightMetrics.sharpeRatio,
  );
  if (sharpeCompare !== 0) {
    return sharpeCompare;
  }

  if (leftMetrics.maxDrawdownPct !== rightMetrics.maxDrawdownPct) {
    return leftMetrics.maxDrawdownPct - rightMetrics.maxDrawdownPct;
  }

  return left.experimentId.localeCompare(right.experimentId);
}

function isOverallTie(left: ComparableExperiment, right: ComparableExperiment): boolean {
  const leftMetrics = left.comparisonMetrics;
  const rightMetrics = right.comparisonMetrics;

  return (
    leftMetrics.finalEquityCents === rightMetrics.finalEquityCents &&
    leftMetrics.sharpeRatio === rightMetrics.sharpeRatio &&
    leftMetrics.maxDrawdownPct === rightMetrics.maxDrawdownPct
  );
}

function sortExperiments(
  experiments: readonly ComparableExperiment[],
): ComparableExperiment[] {
  return [...experiments].sort(compareOverall);
}

function buildRankedExperiment(
  experiment: ComparableExperiment,
  rank: number,
  tiedExperimentIds: readonly string[],
): RankedExperiment {
  return deepFreeze({
    rank,
    experimentId: experiment.experimentId,
    sweepId: experiment.sweepId,
    parameters: deepFreeze({ ...experiment.parameters }),
    metrics: deepFreeze({ ...experiment.comparisonMetrics }),
    tiedExperimentIds: Object.freeze([...tiedExperimentIds]),
  });
}

function buildRankings(
  sortedExperiments: readonly ComparableExperiment[],
): RankedExperiment[] {
  const rankings: RankedExperiment[] = [];

  for (let index = 0; index < sortedExperiments.length; index += 1) {
    const experiment = sortedExperiments[index]!;
    const previous = index > 0 ? sortedExperiments[index - 1] : null;
    const rank =
      previous !== null && isOverallTie(previous, experiment)
        ? rankings[index - 1]!.rank
        : index + 1;

    const tiedExperimentIds = sortedExperiments
      .filter((candidate) => isOverallTie(candidate, experiment))
      .map((candidate) => candidate.experimentId)
      .sort((left, right) => left.localeCompare(right));

    rankings.push(buildRankedExperiment(experiment, rank, tiedExperimentIds));
  }

  return rankings;
}

function buildTieGroups(rankings: readonly RankedExperiment[]): ComparisonTieGroup[] {
  const groups = new Map<number, string[]>();

  for (const ranking of rankings) {
    if (ranking.tiedExperimentIds.length <= 1) {
      continue;
    }

    const existing = groups.get(ranking.rank) ?? [];
    for (const experimentId of ranking.tiedExperimentIds) {
      if (!existing.includes(experimentId)) {
        existing.push(experimentId);
      }
    }
    groups.set(ranking.rank, existing);
  }

  return [...groups.entries()]
    .sort(([leftRank], [rightRank]) => leftRank - rightRank)
    .map(([rank, experimentIds]) =>
      deepFreeze({
        rank,
        experimentIds: Object.freeze(
          [...experimentIds].sort((left, right) => left.localeCompare(right)),
        ),
      }),
    );
}

function metricValue(
  metrics: ComparisonMetricValues,
  metricId: ComparisonMetricId,
): number | null {
  switch (metricId) {
    case ComparisonMetricId.FINAL_EQUITY:
      return metrics.finalEquityCents;
    case ComparisonMetricId.TOTAL_RETURN:
      return metrics.totalReturnPct;
    case ComparisonMetricId.CAGR:
      return metrics.cagrPct;
    case ComparisonMetricId.SHARPE:
      return metrics.sharpeRatio;
    case ComparisonMetricId.MAX_DRAWDOWN:
      return metrics.maxDrawdownPct;
    case ComparisonMetricId.PROFIT_FACTOR:
      return metrics.profitFactor;
    case ComparisonMetricId.WIN_RATE:
      return metrics.winRatePct;
    case ComparisonMetricId.EXPECTANCY:
      return metrics.expectancyCents;
    case ComparisonMetricId.TRADE_COUNT:
      return metrics.tradeCount;
  }
}

function metricDirection(
  metricId: ComparisonMetricId,
): MetricDominanceEntry["direction"] {
  return metricId === ComparisonMetricId.MAX_DRAWDOWN
    ? "lower-is-better"
    : "higher-is-better";
}

function compareMetricValues(
  left: number | null,
  right: number | null,
  direction: MetricDominanceEntry["direction"],
): number {
  const leftValue = left ?? Number.NEGATIVE_INFINITY;
  const rightValue = right ?? Number.NEGATIVE_INFINITY;

  if (direction === "lower-is-better") {
    if (leftValue !== rightValue) {
      return leftValue - rightValue;
    }
    return 0;
  }

  return rightValue - leftValue;
}

function buildDominanceEntry(
  metricId: ComparisonMetricId,
  experiments: readonly ComparableExperiment[],
): MetricDominanceEntry {
  const direction = metricDirection(metricId);

  const sorted = [...experiments].sort((left, right) => {
    const leftValue = metricValue(left.comparisonMetrics, metricId);
    const rightValue = metricValue(right.comparisonMetrics, metricId);
    const comparison = compareMetricValues(leftValue, rightValue, direction);
    if (comparison !== 0) {
      return comparison;
    }
    return left.experimentId.localeCompare(right.experimentId);
  });

  const leaderValue = metricValue(sorted[0]!.comparisonMetrics, metricId);
  const leaderExperimentIds = sorted
    .filter(
      (candidate) =>
        metricValue(candidate.comparisonMetrics, metricId) === leaderValue,
    )
    .map((candidate) => candidate.experimentId)
    .sort((left, right) => left.localeCompare(right));

  return deepFreeze({
    metricId,
    leaderExperimentIds: Object.freeze(leaderExperimentIds),
    leaderValue,
    direction,
  });
}

function buildDominance(
  experiments: readonly ComparableExperiment[],
): MetricDominanceEntry[] {
  return COMPARISON_METRIC_ORDER.map((metricId) =>
    buildDominanceEntry(metricId, experiments),
  );
}

function buildMetricTable(
  experiments: readonly ComparableExperiment[],
): ComparisonMetricTableRow[] {
  return [...experiments]
    .sort((left, right) => left.experimentId.localeCompare(right.experimentId))
    .map((experiment) =>
      deepFreeze({
        experimentId: experiment.experimentId,
        metrics: deepFreeze({ ...experiment.comparisonMetrics }),
      }),
    );
}

function buildSummary(
  rankings: readonly RankedExperiment[],
  dominance: readonly MetricDominanceEntry[],
): ComparisonSummary {
  const winner = rankings[0]!;

  return deepFreeze({
    experimentCount: rankings.length,
    winnerExperimentId: winner.experimentId,
    tiedWinnerExperimentIds: winner.tiedExperimentIds,
    metricLeaders: Object.freeze([...dominance]),
  });
}

function buildComparisonId(rankings: readonly RankedExperiment[]): string {
  const digest = fnv1a32(
    stableStringify(
      rankings.map((ranking) => ({
        experimentId: ranking.experimentId,
        rank: ranking.rank,
        metrics: ranking.metrics,
      })),
    ),
  );
  return `research-comparison-${digest}`;
}

/**
 * Compares completed research experiment results using deterministic metric
 * rankings. Does not execute experiments.
 */
export function compareResearchExperiments(
  experiments: readonly ResearchExperimentResultWithMetrics[],
): ResearchComparison {
  const comparable = validateExperiments(experiments);
  const sorted = sortExperiments(comparable);
  const rankings = Object.freeze(buildRankings(sorted));
  const dominance = Object.freeze(buildDominance(comparable));
  const metricTable = Object.freeze(buildMetricTable(comparable));
  const ties = Object.freeze(buildTieGroups(rankings));
  const winner = rankings[0]!;
  const summary = buildSummary(rankings, dominance);

  return deepFreeze({
    comparisonId: buildComparisonId(rankings),
    winner,
    rankings,
    summary,
    metricTable,
    dominance,
    ties,
  });
}

/** Deterministic JSON-like serialization for comparison output and hashing. */
export function serializeResearchComparison(
  comparison: ResearchComparison,
): string {
  return stableStringify(comparison);
}
