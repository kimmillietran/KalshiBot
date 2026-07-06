import type {
  ExpansionRunHistoryHighlights,
  ExpansionRunHistoryRun,
  ExpansionRunHistoryTrends,
  ExpansionRunTrendDirection,
  ExpansionRunTrendSeries,
} from "./expansionRunHistoryTypes";

function buildTrendSeries(
  runs: readonly ExpansionRunHistoryRun[],
  valueForRun: (run: ExpansionRunHistoryRun) => number | null,
  lowerIsBetter = false,
): ExpansionRunTrendSeries {
  const values = runs.map((run) => ({
    runId: run.runId,
    generatedAt: run.generatedAt,
    value: valueForRun(run),
  }));

  return {
    direction: computeTrendDirection(
      values.map((entry) => entry.value).filter((value): value is number => value !== null),
      lowerIsBetter,
    ),
    values,
  };
}

function computeTrendDirection(
  values: readonly number[],
  lowerIsBetter: boolean,
): ExpansionRunTrendDirection {
  if (values.length < 2) {
    return "insufficient-data";
  }

  const midpoint = Math.max(1, Math.floor(values.length / 2));
  const prior = values.slice(0, midpoint);
  const recent = values.slice(midpoint);
  const recentAvg = recent.reduce((sum, value) => sum + value, 0) / recent.length;
  const comparisonAvg = prior.reduce((sum, value) => sum + value, 0) / prior.length;

  const delta = recentAvg - comparisonAvg;
  const threshold = Math.max(Math.abs(comparisonAvg) * 0.05, 0.01);

  if (Math.abs(delta) <= threshold) {
    return "stable";
  }

  const improving = lowerIsBetter ? delta < 0 : delta > 0;
  return improving ? "improving" : "declining";
}

function findBestThroughputRun(
  runs: readonly ExpansionRunHistoryRun[],
): ExpansionRunHistoryHighlights["bestThroughputRun"] {
  const candidates = runs.filter(
    (run) => run.importsPerMinute !== null && run.importedCount > 0,
  );
  if (candidates.length === 0) {
    return null;
  }

  const best = [...candidates].sort(
    (left, right) => (right.importsPerMinute ?? 0) - (left.importsPerMinute ?? 0),
  )[0]!;

  return {
    runId: best.runId,
    generatedAt: best.generatedAt,
    importsPerMinute: best.importsPerMinute ?? 0,
    importedCount: best.importedCount,
  };
}

function findWorstBottleneckRun(
  runs: readonly ExpansionRunHistoryRun[],
): ExpansionRunHistoryHighlights["worstBottleneckRun"] {
  const candidates = runs.filter((run) => run.discoveryOverheadShare !== null);
  if (candidates.length === 0) {
    return null;
  }

  const worst = [...candidates].sort(
    (left, right) => (right.discoveryOverheadShare ?? 0) - (left.discoveryOverheadShare ?? 0),
  )[0]!;

  return {
    runId: worst.runId,
    generatedAt: worst.generatedAt,
    discoveryOverheadShare: worst.discoveryOverheadShare ?? 0,
    discoveryTimeEstimateMs: worst.discoveryTimeEstimateMs,
  };
}

function computeEfficiencyImproving(runs: readonly ExpansionRunHistoryRun[]): boolean | null {
  const throughputTrend = buildTrendSeries(runs, (run) => run.importsPerMinute).direction;
  const successTrend = buildTrendSeries(runs, (run) => run.importSuccessRate).direction;

  if (throughputTrend === "insufficient-data" && successTrend === "insufficient-data") {
    return null;
  }

  const throughputImproving = throughputTrend === "improving";
  const throughputDeclining = throughputTrend === "declining";
  const successImproving = successTrend === "improving";
  const successDeclining = successTrend === "declining";

  if (throughputImproving || successImproving) {
    if (throughputDeclining || successDeclining) {
      return null;
    }
    return true;
  }

  if (throughputDeclining && successDeclining) {
    return false;
  }

  return null;
}

/** Computes longitudinal trends and highlights across expansion import runs. */
export function analyzeExpansionRunHistory(
  runs: readonly ExpansionRunHistoryRun[],
): {
  trends: ExpansionRunHistoryTrends;
  highlights: ExpansionRunHistoryHighlights;
} {
  const sortedRuns = [...runs].sort((left, right) =>
    left.generatedAt.localeCompare(right.generatedAt),
  );

  const trends: ExpansionRunHistoryTrends = {
    importSuccessRate: buildTrendSeries(sortedRuns, (run) => run.importSuccessRate),
    unsupportedRate: buildTrendSeries(sortedRuns, (run) => run.unsupportedRate, true),
    rateLimitRate: buildTrendSeries(sortedRuns, (run) => run.rateLimitRate, true),
    discoveryOverheadShare: buildTrendSeries(
      sortedRuns,
      (run) => run.discoveryOverheadShare,
      true,
    ),
    importsPerMinute: buildTrendSeries(sortedRuns, (run) => run.importsPerMinute),
    researchYieldPerImportedMarket: buildTrendSeries(
      sortedRuns,
      (run) => run.researchYieldPerImportedMarket,
    ),
  };

  const highlights: ExpansionRunHistoryHighlights = {
    latestRun: sortedRuns.at(-1) ?? null,
    bestThroughputRun: findBestThroughputRun(sortedRuns),
    worstBottleneckRun: findWorstBottleneckRun(sortedRuns),
    efficiencyImproving: computeEfficiencyImproving(sortedRuns),
  };

  return { trends, highlights };
}

export function findBestRunByMetric(
  runs: readonly ExpansionRunHistoryRun[],
  metric: keyof Pick<
    ExpansionRunHistoryRun,
    "importSuccessRate" | "importsPerMinute" | "researchYieldPerImportedMarket"
  >,
): ExpansionRunHistoryRun | null {
  const candidates = runs.filter((run) => run[metric] !== null);
  if (candidates.length === 0) {
    return null;
  }

  return [...candidates].sort(
    (left, right) => (right[metric] as number) - (left[metric] as number),
  )[0]!;
}

export function findWorstRunByMetric(
  runs: readonly ExpansionRunHistoryRun[],
  metric: keyof Pick<
    ExpansionRunHistoryRun,
    "unsupportedRate" | "rateLimitRate" | "discoveryOverheadShare"
  >,
): ExpansionRunHistoryRun | null {
  const candidates = runs.filter((run) => run[metric] !== null);
  if (candidates.length === 0) {
    return null;
  }

  return [...candidates].sort(
    (left, right) => (right[metric] as number) - (left[metric] as number),
  )[0]!;
}
