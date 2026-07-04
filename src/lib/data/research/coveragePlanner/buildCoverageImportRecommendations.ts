import { quarterLabel } from "./coveragePlannerDateUtils";
import {
  averageUnderCoverageSeverity,
  listMonthsByCoverageStatus,
  listMonthsNeedingImport,
} from "./computeMonthCoverageDepth";
import type {
  CoverageImportRecommendation,
  CoverageSnapshot,
  HistoricalCoveragePlanConfig,
  MonthCoverageEntry,
  ParsedCoveragePlannerArtifacts,
} from "./coveragePlannerTypes";

type MonthGapWindow = {
  seriesTicker: string;
  startMonth: string;
  endMonth: string;
  targetMonths: string[];
};

function groupContiguousMonths(months: readonly string[]): string[][] {
  if (months.length === 0) {
    return [];
  }

  const sorted = [...months].sort();
  const groups: string[][] = [[sorted[0]!]];

  for (let index = 1; index < sorted.length; index += 1) {
    const month = sorted[index]!;
    const previous = sorted[index - 1]!;
    const [prevYear, prevMonth] = previous.split("-").map(Number);
    const [year, monthNumber] = month.split("-").map(Number);

    const isAdjacent =
      year === prevYear && monthNumber === (prevMonth ?? 0) + 1
      || year === (prevYear ?? 0) + 1 && monthNumber === 1 && prevMonth === 12;

    if (isAdjacent) {
      groups.at(-1)?.push(month);
    } else {
      groups.push([month]);
    }
  }

  return groups;
}

function unstableHypothesisIds(
  artifacts: ParsedCoveragePlannerArtifacts,
  threshold: number,
): string[] {
  const validations = artifacts.hypothesisValidation?.validations ?? [];
  return validations
    .filter((entry) => {
      const monthRate = entry.timeStability.monthPersistenceRate;
      return !entry.passes || monthRate < threshold;
    })
    .map((entry) => entry.hypothesisId);
}

function dominantSeries(snapshot: CoverageSnapshot): string {
  return snapshot.marketTypeCoverage[0]?.seriesTicker ?? "KXBTC15M";
}

function buildGapWindows(snapshot: CoverageSnapshot): MonthGapWindow[] {
  const seriesTicker = dominantSeries(snapshot);
  const targetMonths = listMonthsNeedingImport(snapshot.monthCoverage);
  const groups = groupContiguousMonths(targetMonths);

  return groups.map((months) => ({
    seriesTicker,
    startMonth: months[0]!,
    endMonth: months.at(-1)!,
    targetMonths: months,
  }));
}

function buildPreHorizonQuarterWindows(
  snapshot: CoverageSnapshot,
  unstableIds: readonly string[],
): MonthGapWindow[] {
  const earliest = snapshot.coverageHorizon.earliestMonth;
  if (!earliest || unstableIds.length === 0) {
    return [];
  }

  const [yearText, monthText] = earliest.split("-");
  const year = Number(yearText);
  const earliestMonthNumber = Number(monthText);
  if (!Number.isFinite(year) || earliestMonthNumber <= 3) {
    return [];
  }

  const q1Months = [`${year}-01`, `${year}-02`, `${year}-03`];
  const q1Gaps = q1Months.filter((month) => {
    const entry = snapshot.monthCoverage.find((candidate) => candidate.month === month);
    return entry === undefined || entry.coverageStatus !== "COVERED";
  });

  if (q1Gaps.length === 0) {
    return [];
  }

  return [
    {
      seriesTicker: dominantSeries(snapshot),
      startMonth: q1Gaps[0]!,
      endMonth: q1Gaps.at(-1)!,
      targetMonths: q1Gaps,
    },
  ];
}

function dedupeWindows(windows: readonly MonthGapWindow[]): MonthGapWindow[] {
  const seen = new Set<string>();
  const deduped: MonthGapWindow[] = [];

  for (const window of windows) {
    const key = `${window.seriesTicker}:${window.startMonth}:${window.endMonth}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(window);
  }

  return deduped;
}

function formatMonthRange(startMonth: string, endMonth: string): string {
  return startMonth === endMonth ? startMonth : `${startMonth} through ${endMonth}`;
}

function includesMissingMonths(
  monthCoverage: readonly MonthCoverageEntry[],
  months: readonly string[],
): boolean {
  const byMonth = new Map(monthCoverage.map((entry) => [entry.month, entry]));
  return months.some((month) => byMonth.get(month)?.coverageStatus === "MISSING");
}

function includesUnderCoveredMonths(
  monthCoverage: readonly MonthCoverageEntry[],
  months: readonly string[],
): boolean {
  const byMonth = new Map(monthCoverage.map((entry) => [entry.month, entry]));
  return months.some((month) => byMonth.get(month)?.coverageStatus === "UNDER_COVERED");
}

function scoreRecommendation(input: {
  targetMonthCount: number;
  averageSeverity: number;
  unstableHypothesisCount: number;
  quarterFullyGapped: boolean;
  marketCount: number;
}): number {
  const monthGapScore = Math.min(40, input.targetMonthCount * 12);
  const severityScore = Math.min(35, Math.round(input.averageSeverity * 35));
  const validationScore = Math.min(25, input.unstableHypothesisCount * 5);
  const quarterScore = input.quarterFullyGapped ? 20 : 0;
  const sparseScore = input.marketCount < 5 ? 15 : input.marketCount < 15 ? 8 : 0;

  return Math.round(
    Math.min(100, monthGapScore + severityScore + validationScore + quarterScore + sparseScore),
  );
}

function quarterFullyGapped(targetMonths: readonly string[]): boolean {
  if (targetMonths.length === 0) {
    return false;
  }

  const quarters = new Set(targetMonths.map((month) => quarterLabel(month)));
  return quarters.size === 1 && targetMonths.length >= 2;
}

function describeMonthGaps(
  monthCoverage: readonly MonthCoverageEntry[],
  months: readonly string[],
): string {
  const byMonth = new Map(monthCoverage.map((entry) => [entry.month, entry]));
  const labels = months.map((month) => {
    const entry = byMonth.get(month);
    if (!entry) {
      return `${month} (missing)`;
    }

    if (entry.coverageStatus === "MISSING") {
      return `${month} (missing)`;
    }

    return `${month} (${entry.marketCount}/${entry.thresholds.minMarketsPerMonth} markets, ${entry.tradingDayCount}/${entry.thresholds.minTradingDaysPerMonth} trading days)`;
  });

  return labels.join("; ");
}

function buildRationale(
  window: MonthGapWindow,
  snapshot: CoverageSnapshot,
  unstableIds: readonly string[],
  threshold: number,
): string {
  const range = formatMonthRange(window.startMonth, window.endMonth);
  const quarter = quarterLabel(window.startMonth);
  const gapSummary = describeMonthGaps(snapshot.monthCoverage, window.targetMonths);
  const hasMissing = includesMissingMonths(snapshot.monthCoverage, window.targetMonths);
  const hasUnderCovered = includesUnderCoveredMonths(
    snapshot.monthCoverage,
    window.targetMonths,
  );

  if (unstableIds.length > 0) {
    const stabilityNote = `current hypotheses fail month-stability checks (monthPersistenceRate < ${threshold})`;
    if (hasMissing && hasUnderCovered) {
      return `Import ${window.seriesTicker} markets for ${range} because ${stabilityNote} and ${quarter} has missing and under-covered months (${gapSummary}).`;
    }
    if (hasUnderCovered) {
      return `Import ${window.seriesTicker} markets for ${range} because ${stabilityNote} and ${quarter} months are under-covered (${gapSummary}).`;
    }
    return `Import ${window.seriesTicker} markets for ${range} because ${stabilityNote} and ${quarter} coverage is absent.`;
  }

  if (hasMissing && hasUnderCovered) {
    return `Import ${window.seriesTicker} markets for ${range} because ${quarter} has missing and under-covered months (${gapSummary}).`;
  }

  if (hasUnderCovered) {
    return `Import ${window.seriesTicker} markets for ${range} because ${quarter} months are under-covered relative to depth thresholds (${gapSummary}).`;
  }

  return `Import ${window.seriesTicker} markets for ${range} because ${quarter} coverage is absent in the current historical dataset.`;
}

function buildExpectedBenefit(
  window: MonthGapWindow,
  snapshot: CoverageSnapshot,
  unstableIds: readonly string[],
  artifacts: ParsedCoveragePlannerArtifacts,
): string {
  const hasMissing = includesMissingMonths(snapshot.monthCoverage, window.targetMonths);
  const hasUnderCovered = includesUnderCoveredMonths(
    snapshot.monthCoverage,
    window.targetMonths,
  );
  const benefits: string[] = [];

  if (hasMissing) {
    benefits.push(
      `Adds ${listMonthsByCoverageStatus(
        snapshot.monthCoverage.filter((entry) => window.targetMonths.includes(entry.month)),
        "MISSING",
      ).length} missing calendar month(s) for ${window.seriesTicker}.`,
    );
  }

  if (hasUnderCovered) {
    benefits.push(
      `Deepens under-covered months for ${window.seriesTicker} toward ${snapshot.depthThresholds.minMarketsPerMonth} markets and ${snapshot.depthThresholds.minTradingDaysPerMonth} trading days per month.`,
    );
  }

  if (unstableIds.length > 0) {
    benefits.push(
      `Supports month-stability validation for ${unstableIds.length} hypothesis candidate(s).`,
    );
  }

  const atlasSamples = artifacts.mispricingAtlas?.sampleCounts;
  if (atlasSamples && atlasSamples.marketCount < 20) {
    benefits.push(
      "Expands mispricing atlas sample depth so coarse buckets can clear minimum evidence thresholds.",
    );
  }

  const health = artifacts.dataHealth;
  if (health && health.pipelineCoverage.researchOutputs === 0) {
    benefits.push(
      "Improves pipeline coverage so downstream replay and calibration stages have more markets to process.",
    );
  }

  return benefits.join(" ");
}

/** Builds prioritized import window recommendations from coverage gaps. */
export function buildCoverageImportRecommendations(
  snapshot: CoverageSnapshot,
  artifacts: ParsedCoveragePlannerArtifacts,
  config: Pick<
    HistoricalCoveragePlanConfig,
    "monthPersistenceThreshold" | "minMarketsPerMonth" | "minTradingDaysPerMonth"
  >,
): CoverageImportRecommendation[] {
  const unstableIds = unstableHypothesisIds(
    artifacts,
    config.monthPersistenceThreshold,
  );
  const windows = dedupeWindows([
    ...buildPreHorizonQuarterWindows(snapshot, unstableIds),
    ...buildGapWindows(snapshot),
  ]);

  const recommendations = windows.map((window, index) => {
    const averageSeverity = averageUnderCoverageSeverity(
      snapshot.monthCoverage,
      window.targetMonths,
    );
    const priorityScore = scoreRecommendation({
      targetMonthCount: window.targetMonths.length,
      averageSeverity,
      unstableHypothesisCount: unstableIds.length,
      quarterFullyGapped: quarterFullyGapped(window.targetMonths),
      marketCount: snapshot.marketCount,
    });

    return {
      recommendationId: `coverage-import-${index + 1}`,
      seriesTicker: window.seriesTicker,
      startMonth: window.startMonth,
      endMonth: window.endMonth,
      missingMonths: window.targetMonths,
      includesMissing: includesMissingMonths(snapshot.monthCoverage, window.targetMonths),
      includesUnderCovered: includesUnderCoveredMonths(
        snapshot.monthCoverage,
        window.targetMonths,
      ),
      priorityScore,
      rationale: buildRationale(window, snapshot, unstableIds, config.monthPersistenceThreshold),
      expectedResearchBenefit: buildExpectedBenefit(
        window,
        snapshot,
        unstableIds,
        artifacts,
      ),
      supportingHypothesisIds: unstableIds.slice(0, 5),
    };
  });

  return recommendations.sort(
    (left, right) => right.priorityScore - left.priorityScore,
  );
}
