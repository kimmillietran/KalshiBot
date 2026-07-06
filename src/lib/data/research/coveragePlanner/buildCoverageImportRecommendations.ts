import { quarterLabel } from "./coveragePlannerDateUtils";
import {
  averageUnderCoverageSeverity,
  listMonthsByCoverageStatus,
} from "./computeMonthCoverageDepth";
import { estimateRecommendationImportability } from "./importability/estimateRecommendationImportability";
import type { ParsedExpansionImportMarketRecord } from "./importability/importabilityTypes";
import { splitMonthGapWindowsToMonthSegments } from "./splitMonthGapWindowsToMonthSegments";
import { isPromisingHypothesis } from "./buildTemporalBalanceDiagnostics";
import type {
  CoverageImportRecommendation,
  CoverageSnapshot,
  HistoricalCoveragePlanConfig,
  HypothesisTemporalBalanceEntry,
  MonthCoverageEntry,
  ParsedCoveragePlannerArtifacts,
  TemporalBalanceDiagnostics,
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
  const targetMonths = snapshot.monthCoverage
    .filter((entry) => entry.coverageStatus !== "COVERED")
    .map((entry) => entry.month);
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

function scoreCoverageGapRecommendation(input: {
  targetMonthCount: number;
  averageSeverity: number;
  unstableHypothesisCount: number;
  quarterFullyGapped: boolean;
  marketCount: number;
  estimatedSupportLevel: "high" | "medium" | "low";
}): number {
  const monthGapScore = Math.min(40, input.targetMonthCount * 12);
  const severityScore = Math.min(35, Math.round(input.averageSeverity * 35));
  const validationScore = Math.min(25, input.unstableHypothesisCount * 5);
  const quarterScore = input.quarterFullyGapped ? 20 : 0;
  const sparseScore = input.marketCount < 5 ? 15 : input.marketCount < 15 ? 8 : 0;
  const importabilityScore =
    input.estimatedSupportLevel === "high"
      ? 15
      : input.estimatedSupportLevel === "low"
        ? -25
        : 0;

  return Math.round(
    Math.min(
      100,
      Math.max(
        0,
        monthGapScore
          + severityScore
          + validationScore
          + quarterScore
          + sparseScore
          + importabilityScore,
      ),
    ),
  );
}

const TEMPORAL_BALANCE_PRIORITY_BOOST = 45;

function scoreTemporalBalanceRecommendation(input: {
  hypothesis: HypothesisTemporalBalanceEntry;
  targetMonthCount: number;
  estimatedSupportLevel: "high" | "medium" | "low";
}): number {
  const robustnessScore = Math.min(35, Math.round(input.hypothesis.robustnessScore * 0.45));
  const thinMonthScore = Math.min(30, input.hypothesis.thinMonths.length * 10);
  const windowScore = Math.min(20, input.targetMonthCount * 8);
  const benefitScore =
    (input.hypothesis.validationBenefit.improvesMonthPersistence ? 8 : 0)
    + (input.hypothesis.validationBenefit.improvesLeaveOneMonthOutStability ? 8 : 0)
    + (input.hypothesis.validationBenefit.improvesSampleConcentration ? 6 : 0);
  const importabilityScore =
    input.estimatedSupportLevel === "high"
      ? 12
      : input.estimatedSupportLevel === "low"
        ? -20
        : 0;

  return Math.round(
    Math.min(
      100,
      Math.max(
        0,
        robustnessScore + thinMonthScore + windowScore + benefitScore + importabilityScore
          + TEMPORAL_BALANCE_PRIORITY_BOOST,
      ),
    ),
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

function buildCoverageGapRationale(
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

function buildTemporalBalanceRationale(
  window: MonthGapWindow,
  hypothesis: HypothesisTemporalBalanceEntry,
): string {
  const range = formatMonthRange(window.startMonth, window.endMonth);
  const thinSummary = hypothesis.thinMonths
    .filter((month) => window.targetMonths.includes(month))
    .map((month) => {
      const entry = hypothesis.monthObservationDistribution.find(
        (distribution) => distribution.month === month,
      );
      return `${month} (${entry?.observations ?? 0}/${hypothesis.targetMinimumObservationsPerMonth} obs)`;
    })
    .join("; ");

  return `Temporal-balance import for ${window.seriesTicker} ${range} to strengthen "${hypothesis.hypothesis}" (robustness ${hypothesis.robustnessScore}). Thin months: ${thinSummary}.`;
}

function buildCoverageGapBenefit(
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

function appendImportabilityNote(
  rationale: string,
  importability: {
    estimatedSupportLevel: "high" | "medium" | "low";
    estimatedUnsupportedRate: number;
    attemptedCount: number;
  },
): string {
  if (importability.attemptedCount === 0) {
    return `${rationale} No prior expansion import attempts were recorded for this window.`;
  }

  const unsupportedPct = Math.round(importability.estimatedUnsupportedRate * 100);
  if (importability.estimatedSupportLevel === "high") {
    return `${rationale} Prior imports in this window succeeded with a low unsupported rate (${unsupportedPct}%).`;
  }

  if (importability.estimatedSupportLevel === "low") {
    return `${rationale} Prior imports in this window were mostly unsupported (${unsupportedPct}% unsupported); deprioritized.`;
  }

  return `${rationale} Prior import support is mixed (${unsupportedPct}% unsupported).`;
}

function buildTemporalBalanceRecommendations(
  snapshot: CoverageSnapshot,
  temporalBalance: TemporalBalanceDiagnostics,
  importabilityMarkets: readonly ParsedExpansionImportMarketRecord[],
  alignImportWindowsToMonthSegments: boolean,
): CoverageImportRecommendation[] {
  const seriesTicker = dominantSeries(snapshot);
  const recommendations: CoverageImportRecommendation[] = [];

  for (const hypothesis of temporalBalance.hypothesisBalances) {
    const groups = groupContiguousMonths(hypothesis.thinMonths);

    for (const months of groups) {
      const monthWindows = alignImportWindowsToMonthSegments
        ? months.map((month) => [month])
        : [months];

      for (const segmentMonths of monthWindows) {
      const importability = estimateRecommendationImportability(importabilityMarkets, {
        seriesTicker,
        startMonth: segmentMonths[0]!,
        endMonth: segmentMonths.at(-1)!,
      });

      recommendations.push({
        recommendationId: `temporal-balance-${hypothesis.hypothesisId}-${segmentMonths[0]}`,
        recommendationType: "temporal-balance-import",
        seriesTicker,
        startMonth: segmentMonths[0]!,
        endMonth: segmentMonths.at(-1)!,
        missingMonths: segmentMonths,
        includesMissing: includesMissingMonths(snapshot.monthCoverage, segmentMonths),
        includesUnderCovered: includesUnderCoveredMonths(snapshot.monthCoverage, segmentMonths),
        priorityScore: scoreTemporalBalanceRecommendation({
          hypothesis,
          targetMonthCount: segmentMonths.length,
          estimatedSupportLevel: importability.estimatedSupportLevel,
        }),
        rationale: appendImportabilityNote(
          buildTemporalBalanceRationale(
            {
              seriesTicker,
              startMonth: segmentMonths[0]!,
              endMonth: segmentMonths.at(-1)!,
              targetMonths: segmentMonths,
            },
            hypothesis,
          ),
          importability,
        ),
        expectedResearchBenefit: hypothesis.expectedValidationBenefit,
        supportingHypothesisIds: [hypothesis.hypothesisId],
        targetHypothesisIds: [hypothesis.hypothesisId],
        estimatedSupportLevel: importability.estimatedSupportLevel,
        estimatedUnsupportedRate: importability.estimatedUnsupportedRate,
      });
      }
    }
  }

  return recommendations;
}

function buildCoverageGapRecommendations(
  snapshot: CoverageSnapshot,
  artifacts: ParsedCoveragePlannerArtifacts,
  config: Pick<
    HistoricalCoveragePlanConfig,
    | "monthPersistenceThreshold"
    | "minMarketsPerMonth"
    | "minTradingDaysPerMonth"
    | "alignImportWindowsToMonthSegments"
  >,
  importabilityMarkets: readonly ParsedExpansionImportMarketRecord[],
): CoverageImportRecommendation[] {
  const unstableIds = unstableHypothesisIds(
    artifacts,
    config.monthPersistenceThreshold,
  );
  let windows = dedupeWindows([
    ...buildPreHorizonQuarterWindows(snapshot, unstableIds),
    ...buildGapWindows(snapshot),
  ]);

  if (config.alignImportWindowsToMonthSegments) {
    windows = splitMonthGapWindowsToMonthSegments(windows);
  }

  return windows.map((window, index) => {
    const averageSeverity = averageUnderCoverageSeverity(
      snapshot.monthCoverage,
      window.targetMonths,
    );
    const importability = estimateRecommendationImportability(importabilityMarkets, {
      seriesTicker: window.seriesTicker,
      startMonth: window.startMonth,
      endMonth: window.endMonth,
    });
    const priorityScore = scoreCoverageGapRecommendation({
      targetMonthCount: window.targetMonths.length,
      averageSeverity,
      unstableHypothesisCount: unstableIds.length,
      quarterFullyGapped: quarterFullyGapped(window.targetMonths),
      marketCount: snapshot.marketCount,
      estimatedSupportLevel: importability.estimatedSupportLevel,
    });

    return {
      recommendationId: `coverage-import-${index + 1}`,
      recommendationType: "coverage-gap-import",
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
      rationale: appendImportabilityNote(
        buildCoverageGapRationale(
          window,
          snapshot,
          unstableIds,
          config.monthPersistenceThreshold,
        ),
        importability,
      ),
      expectedResearchBenefit: buildCoverageGapBenefit(
        window,
        snapshot,
        unstableIds,
        artifacts,
      ),
      supportingHypothesisIds: unstableIds.slice(0, 5),
      targetHypothesisIds: [],
      estimatedSupportLevel: importability.estimatedSupportLevel,
      estimatedUnsupportedRate: importability.estimatedUnsupportedRate,
    };
  });
}

function mergeRecommendations(
  recommendations: readonly CoverageImportRecommendation[],
): CoverageImportRecommendation[] {
  const byKey = new Map<string, CoverageImportRecommendation>();

  for (const recommendation of recommendations) {
    const key = `${recommendation.seriesTicker}:${recommendation.startMonth}:${recommendation.endMonth}`;
    const existing = byKey.get(key);

    if (!existing) {
      byKey.set(key, recommendation);
      continue;
    }

    const preferred =
      recommendation.recommendationType === "temporal-balance-import"
      && existing.recommendationType === "coverage-gap-import"
        ? recommendation
        : recommendation.priorityScore > existing.priorityScore
          ? recommendation
          : existing;

    byKey.set(key, {
      ...preferred,
      priorityScore: Math.max(existing.priorityScore, recommendation.priorityScore),
      supportingHypothesisIds: [
        ...new Set([
          ...existing.supportingHypothesisIds,
          ...recommendation.supportingHypothesisIds,
        ]),
      ].sort(),
      targetHypothesisIds: [
        ...new Set([
          ...existing.targetHypothesisIds,
          ...recommendation.targetHypothesisIds,
        ]),
      ].sort(),
    });
  }

  return [...byKey.values()].sort((left, right) => {
    const scoreCompare = right.priorityScore - left.priorityScore;
    if (scoreCompare !== 0) {
      return scoreCompare;
    }

    if (
      left.recommendationType === "temporal-balance-import"
      && right.recommendationType !== "temporal-balance-import"
    ) {
      return -1;
    }

    if (
      right.recommendationType === "temporal-balance-import"
      && left.recommendationType !== "temporal-balance-import"
    ) {
      return 1;
    }

    return left.recommendationId.localeCompare(right.recommendationId);
  });
}

/** Builds prioritized import window recommendations from coverage gaps and temporal balance. */
export function buildCoverageImportRecommendations(
  snapshot: CoverageSnapshot,
  artifacts: ParsedCoveragePlannerArtifacts,
  config: Pick<
    HistoricalCoveragePlanConfig,
    | "monthPersistenceThreshold"
    | "minMarketsPerMonth"
    | "minTradingDaysPerMonth"
    | "alignImportWindowsToMonthSegments"
  >,
  importabilityMarkets: readonly ParsedExpansionImportMarketRecord[] = [],
  temporalBalance?: TemporalBalanceDiagnostics,
): CoverageImportRecommendation[] {
  const coverageGapRecommendations = buildCoverageGapRecommendations(
    snapshot,
    artifacts,
    config,
    importabilityMarkets,
  );

  if (!temporalBalance || temporalBalance.hypothesisBalances.length === 0) {
    return coverageGapRecommendations;
  }

  const temporalRecommendations = buildTemporalBalanceRecommendations(
    snapshot,
    temporalBalance,
    importabilityMarkets,
    config.alignImportWindowsToMonthSegments,
  );

  return mergeRecommendations([
    ...temporalRecommendations,
    ...coverageGapRecommendations,
  ]);
}

export { isPromisingHypothesis };
