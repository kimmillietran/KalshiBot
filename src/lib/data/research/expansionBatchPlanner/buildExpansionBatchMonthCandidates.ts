import { estimateRecommendationImportability } from "@/lib/data/research/coveragePlanner/importability/estimateRecommendationImportability";
import type { ParsedExpansionImportMarketRecord } from "@/lib/data/research/coveragePlanner/importability/importabilityTypes";
import type {
  CoverageDepthStatus,
  HistoricalCoveragePlanReport,
} from "@/lib/data/research/coveragePlanner/coveragePlannerTypes";
import type { CoverageAwareValidationReport } from "@/lib/data/research/coverageAwareValidation/coverageAwareValidationTypes";

import type { ExpansionBatchMonthCandidate } from "./expansionBatchPlannerTypes";
import type { LoadedExpansionBatchPlannerInputs } from "./loadExpansionBatchPlannerInputs";
import { collectExpandedCandidateMonths } from "./collectExpansionBatchCandidateMonths";

function dominantSeries(coveragePlan: HistoricalCoveragePlanReport): string {
  return coveragePlan.snapshot.marketTypeCoverage[0]?.seriesTicker ?? "KXBTC15M";
}

function coverageStatusForMonth(
  coveragePlan: HistoricalCoveragePlanReport,
  month: string,
): CoverageDepthStatus {
  const entry = coveragePlan.snapshot.monthCoverage.find((candidate) => candidate.month === month);
  return entry?.coverageStatus ?? "MISSING";
}

function recommendationPriorityForMonth(
  coveragePlan: HistoricalCoveragePlanReport,
  month: string,
): number {
  let maxPriority = 0;

  for (const recommendation of coveragePlan.recommendations) {
    if (
      month >= recommendation.startMonth
      && month <= recommendation.endMonth
    ) {
      maxPriority = Math.max(maxPriority, recommendation.priorityScore);
    }
  }

  return maxPriority;
}

function targetHypothesisIdsForMonth(
  coveragePlan: HistoricalCoveragePlanReport,
  month: string,
): string[] {
  const ids = new Set<string>();

  for (const recommendation of coveragePlan.recommendations) {
    if (month >= recommendation.startMonth && month <= recommendation.endMonth) {
      for (const hypothesisId of recommendation.targetHypothesisIds) {
        ids.add(hypothesisId);
      }
    }
  }

  for (const balance of coveragePlan.temporalBalance.hypothesisBalances) {
    if (balance.thinMonths.includes(month)) {
      ids.add(balance.hypothesisId);
    }
  }

  return [...ids].sort();
}

function expectedValidationBenefitForMonth(
  coveragePlan: HistoricalCoveragePlanReport,
  month: string,
): string {
  const benefits = coveragePlan.temporalBalance.hypothesisBalances
    .filter((balance) => balance.thinMonths.includes(month))
    .map((balance) => balance.expectedValidationBenefit);

  if (benefits.length > 0) {
    return benefits[0]!;
  }

  const recommendation = coveragePlan.recommendations.find(
    (entry) => month >= entry.startMonth && month <= entry.endMonth,
  );

  return recommendation?.expectedResearchBenefit
    ?? "Adds historical coverage for downstream research validation.";
}

function thinHypothesisCountForMonth(
  coveragePlan: HistoricalCoveragePlanReport,
  month: string,
): number {
  return coveragePlan.temporalBalance.hypothesisBalances.filter((balance) =>
    balance.thinMonths.includes(month),
  ).length;
}

function coverageAwareBoostForMonth(
  coverageAwareValidation: CoverageAwareValidationReport | null,
  hypothesisIds: readonly string[],
): number {
  if (!coverageAwareValidation || hypothesisIds.length === 0) {
    return 0;
  }

  const classificationWeight: Record<string, number> = {
    "promising-needs-more-history": 12,
    "inconclusive-insufficient-coverage": 8,
    "inconclusive-regime-sparse": 4,
    "robust-enough-to-test": 1,
    rejected: 0,
  };

  let boost = 0;
  for (const entry of coverageAwareValidation.entries) {
    if (!hypothesisIds.includes(entry.hypothesisId)) {
      continue;
    }

    boost = Math.max(boost, classificationWeight[entry.classification] ?? 0);
  }

  return boost;
}

function monthDiagnosticsFor(
  coveragePlan: HistoricalCoveragePlanReport,
  month: string,
): {
  currentObservations: number;
  currentMarketCount: number;
} {
  const diagnostics = coveragePlan.temporalBalance.monthDiagnostics.find(
    (entry) => entry.month === month,
  );
  const snapshotMonth = coveragePlan.snapshot.monthCoverage.find(
    (entry) => entry.month === month,
  );

  return {
    currentObservations: diagnostics?.qualifyingHypothesisObservationCount ?? 0,
    currentMarketCount: snapshotMonth?.marketCount ?? diagnostics?.marketCount ?? 0,
  };
}

function desiredObservationsForMonth(
  coveragePlan: HistoricalCoveragePlanReport,
  month: string,
): number {
  const temporalTarget = coveragePlan.temporalBalance.targetMinimumObservationsPerMonth;
  const marketTarget = coveragePlan.snapshot.depthThresholds.minMarketsPerMonth;
  const isThin = coveragePlan.temporalBalance.hypothesisBalances.some((balance) =>
    balance.thinMonths.includes(month),
  );

  return isThin ? Math.max(temporalTarget, marketTarget) : marketTarget;
}

/** Builds month-level import candidates from coverage and validation artifacts. */
export function buildExpansionBatchMonthCandidates(
  inputs: LoadedExpansionBatchPlannerInputs,
  importabilityMarkets: readonly ParsedExpansionImportMarketRecord[],
  candidateMonths?: readonly string[],
): ExpansionBatchMonthCandidate[] {
  const { coveragePlan, coverageAwareValidation, discoveryMarketsByMonth, expansionConfig } =
    inputs;
  const seriesTicker = dominantSeries(coveragePlan);
  const months =
    candidateMonths
    ?? collectExpandedCandidateMonths({
      coveragePlan,
      expansionConfig,
    });

  return months.map((month) => {
    const targetHypothesisIds = targetHypothesisIdsForMonth(coveragePlan, month);
    const importability = estimateRecommendationImportability(importabilityMarkets, {
      seriesTicker,
      startMonth: month,
      endMonth: month,
    });
    const diagnostics = monthDiagnosticsFor(coveragePlan, month);

    return {
      month,
      seriesTicker,
      coverageStatus: coverageStatusForMonth(coveragePlan, month),
      targetHypothesisIds,
      expectedValidationBenefit: expectedValidationBenefitForMonth(coveragePlan, month),
      expectedImportability: importability.estimatedSupportLevel,
      estimatedUnsupportedRate: importability.estimatedUnsupportedRate,
      currentObservations: diagnostics.currentObservations,
      currentMarketCount: diagnostics.currentMarketCount,
      desiredObservations: desiredObservationsForMonth(coveragePlan, month),
      discoveryAvailableCount: discoveryMarketsByMonth.get(month) ?? null,
      recommendationPriority: recommendationPriorityForMonth(coveragePlan, month),
      thinHypothesisCount: thinHypothesisCountForMonth(coveragePlan, month),
      coverageAwareBoost: coverageAwareBoostForMonth(
        coverageAwareValidation,
        targetHypothesisIds,
      ),
    };
  });
}
