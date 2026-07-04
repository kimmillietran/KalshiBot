import type {
  CoverageDepthStatus,
  MonthCoverageEntry,
  MonthCoverageThresholdComparison,
} from "./coveragePlannerTypes";

export type CoverageDepthThresholds = {
  minMarketsPerMonth: number;
  minTradingDaysPerMonth: number;
};

/** Classifies a month's coverage depth against configurable thresholds. */
export function classifyMonthCoverageDepth(
  marketCount: number,
  tradingDayCount: number,
  thresholds: CoverageDepthThresholds,
): {
  coverageStatus: CoverageDepthStatus;
  thresholds: MonthCoverageThresholdComparison;
} {
  const comparison: MonthCoverageThresholdComparison = {
    minMarketsPerMonth: thresholds.minMarketsPerMonth,
    minTradingDaysPerMonth: thresholds.minTradingDaysPerMonth,
    marketsMet: marketCount >= thresholds.minMarketsPerMonth,
    tradingDaysMet: tradingDayCount >= thresholds.minTradingDaysPerMonth,
  };

  if (marketCount === 0) {
    return { coverageStatus: "MISSING", thresholds: comparison };
  }

  if (!comparison.marketsMet || !comparison.tradingDaysMet) {
    return { coverageStatus: "UNDER_COVERED", thresholds: comparison };
  }

  return { coverageStatus: "COVERED", thresholds: comparison };
}

/** Returns 0–1 severity where 1 is fully missing and higher means worse under-coverage. */
export function computeUnderCoverageSeverity(entry: MonthCoverageEntry): number {
  if (entry.coverageStatus === "MISSING") {
    return 1;
  }

  if (entry.coverageStatus !== "UNDER_COVERED") {
    return 0;
  }

  const marketRatio =
    entry.thresholds.minMarketsPerMonth > 0
      ? entry.marketCount / entry.thresholds.minMarketsPerMonth
      : 1;
  const dayRatio =
    entry.thresholds.minTradingDaysPerMonth > 0
      ? entry.tradingDayCount / entry.thresholds.minTradingDaysPerMonth
      : 1;

  return Math.min(1, Math.max(0, 1 - Math.min(marketRatio, dayRatio)));
}

export function listMonthsByCoverageStatus(
  monthCoverage: readonly MonthCoverageEntry[],
  status: CoverageDepthStatus,
): string[] {
  return monthCoverage
    .filter((entry) => entry.coverageStatus === status)
    .map((entry) => entry.month);
}

export function listMonthsNeedingImport(monthCoverage: readonly MonthCoverageEntry[]): string[] {
  return monthCoverage
    .filter((entry) => entry.coverageStatus !== "COVERED")
    .map((entry) => entry.month)
    .sort();
}

export function averageUnderCoverageSeverity(
  monthCoverage: readonly MonthCoverageEntry[],
  months: readonly string[],
): number {
  if (months.length === 0) {
    return 0;
  }

  const byMonth = new Map(monthCoverage.map((entry) => [entry.month, entry]));
  const total = months.reduce((sum, month) => {
    const entry = byMonth.get(month);
    return sum + (entry ? computeUnderCoverageSeverity(entry) : 1);
  }, 0);

  return total / months.length;
}
