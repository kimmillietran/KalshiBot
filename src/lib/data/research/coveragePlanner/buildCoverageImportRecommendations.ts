import { quarterLabel } from "./coveragePlannerDateUtils";
import type {
  CoverageImportRecommendation,
  CoverageSnapshot,
  HistoricalCoveragePlanConfig,
  ParsedCoveragePlannerArtifacts,
} from "./coveragePlannerTypes";

type MonthGapWindow = {
  seriesTicker: string;
  startMonth: string;
  endMonth: string;
  missingMonths: string[];
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
  const groups = groupContiguousMonths(snapshot.missingMonths);

  return groups.map((missingMonths) => ({
    seriesTicker,
    startMonth: missingMonths[0]!,
    endMonth: missingMonths.at(-1)!,
    missingMonths,
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

  const observed = new Set(snapshot.monthCoverage.map((entry) => entry.month));
  const q1Months = [`${year}-01`, `${year}-02`, `${year}-03`];
  const missingQ1 = q1Months.filter((month) => !observed.has(month));
  if (missingQ1.length === 0) {
    return [];
  }

  return [
    {
      seriesTicker: dominantSeries(snapshot),
      startMonth: missingQ1[0]!,
      endMonth: missingQ1.at(-1)!,
      missingMonths: missingQ1,
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

function scoreRecommendation(input: {
  missingMonthCount: number;
  unstableHypothesisCount: number;
  quarterFullyMissing: boolean;
  marketCount: number;
}): number {
  const monthGapScore = Math.min(40, input.missingMonthCount * 12);
  const validationScore = Math.min(25, input.unstableHypothesisCount * 5);
  const quarterScore = input.quarterFullyMissing ? 20 : 0;
  const sparseScore = input.marketCount < 5 ? 15 : input.marketCount < 15 ? 8 : 0;

  return Math.round(
    Math.min(100, monthGapScore + validationScore + quarterScore + sparseScore),
  );
}

function quarterFullyMissing(missingMonths: readonly string[]): boolean {
  if (missingMonths.length === 0) {
    return false;
  }

  const quarters = new Set(missingMonths.map((month) => quarterLabel(month)));
  return quarters.size === 1 && missingMonths.length >= 2;
}

function buildRationale(
  window: MonthGapWindow,
  unstableIds: readonly string[],
  threshold: number,
): string {
  const range = formatMonthRange(window.startMonth, window.endMonth);
  const quarter = quarterLabel(window.startMonth);

  if (unstableIds.length > 0) {
    return `Import ${window.seriesTicker} markets for ${range} because current hypotheses fail month-stability checks (monthPersistenceRate < ${threshold}) and ${quarter} coverage is absent.`;
  }

  return `Import ${window.seriesTicker} markets for ${range} because ${quarter} coverage is absent in the current historical dataset.`;
}

function buildExpectedBenefit(
  window: MonthGapWindow,
  unstableIds: readonly string[],
  artifacts: ParsedCoveragePlannerArtifacts,
): string {
  const benefits: string[] = [
    `Adds ${window.missingMonths.length} missing calendar month(s) for ${window.seriesTicker}.`,
  ];

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
  config: Pick<HistoricalCoveragePlanConfig, "monthPersistenceThreshold">,
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
    const priorityScore = scoreRecommendation({
      missingMonthCount: window.missingMonths.length,
      unstableHypothesisCount: unstableIds.length,
      quarterFullyMissing: quarterFullyMissing(window.missingMonths),
      marketCount: snapshot.marketCount,
    });

    return {
      recommendationId: `coverage-import-${index + 1}`,
      seriesTicker: window.seriesTicker,
      startMonth: window.startMonth,
      endMonth: window.endMonth,
      missingMonths: window.missingMonths,
      priorityScore,
      rationale: buildRationale(window, unstableIds, config.monthPersistenceThreshold),
      expectedResearchBenefit: buildExpectedBenefit(window, unstableIds, artifacts),
      supportingHypothesisIds: unstableIds.slice(0, 5),
    };
  });

  return recommendations.sort(
    (left, right) => right.priorityScore - left.priorityScore,
  );
}
