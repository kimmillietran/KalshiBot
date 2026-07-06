import { calendarMonthsBetween, enumerateMonthRange } from "@/lib/data/research/coveragePlanner/coveragePlannerDateUtils";
import type { HistoricalCoveragePlanReport } from "@/lib/data/research/coveragePlanner/coveragePlannerTypes";
import type { HistoricalExpansionImportConfig } from "@/lib/data/importJobs/expansionConfig/expansionConfigTypes";

function sortUniqueMonths(months: Iterable<string>): string[] {
  return [...new Set(months)].sort();
}

/** Months with coverage gaps, thin evidence, or recommendation linkage. */
export function collectKnownCandidateMonths(
  coveragePlan: HistoricalCoveragePlanReport,
): string[] {
  const months = new Set<string>([
    ...coveragePlan.snapshot.missingMonths,
    ...coveragePlan.snapshot.underCoveredMonths,
    ...coveragePlan.temporalBalance.hypothesisBalances.flatMap((balance) => balance.thinMonths),
    ...coveragePlan.recommendations.flatMap((recommendation) => recommendation.missingMonths),
  ]);

  return sortUniqueMonths(months);
}

function monthsFromCoverageRecommendations(
  coveragePlan: HistoricalCoveragePlanReport,
): string[] {
  const months: string[] = [];

  for (const recommendation of coveragePlan.recommendations) {
    months.push(
      ...enumerateMonthRange(recommendation.startMonth, recommendation.endMonth),
      ...recommendation.missingMonths,
    );
  }

  return months;
}

function monthsFromExpansionConfigJobs(
  expansionConfig: HistoricalExpansionImportConfig | null,
): string[] {
  if (!expansionConfig) {
    return [];
  }

  const months: string[] = [];
  for (const job of expansionConfig.jobs) {
    if (job.status !== "scheduled") {
      continue;
    }

    months.push(...calendarMonthsBetween(job.windowStart, job.windowEnd));
  }

  return months;
}

/** Expands the candidate universe beyond known gaps using recommendation windows and jobs. */
export function collectExpandedCandidateMonths(input: {
  coveragePlan: HistoricalCoveragePlanReport;
  expansionConfig: HistoricalExpansionImportConfig | null;
}): string[] {
  return sortUniqueMonths([
    ...collectKnownCandidateMonths(input.coveragePlan),
    ...monthsFromCoverageRecommendations(input.coveragePlan),
    ...monthsFromExpansionConfigJobs(input.expansionConfig),
  ]);
}
