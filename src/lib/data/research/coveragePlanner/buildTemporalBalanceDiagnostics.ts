import type { HypothesisValidationEntry } from "@/lib/data/research/hypothesisRobustness/hypothesisRobustnessTypes";
import { DEFAULT_MIN_PERIOD_OBSERVATIONS } from "@/lib/data/research/hypothesisRobustness/hypothesisRobustnessTypes";

import type {
  CoverageSnapshot,
  HypothesisTemporalBalanceEntry,
  HypothesisValidationBenefit,
  ParsedCoveragePlannerArtifacts,
  TemporalBalanceDiagnostics,
  TemporalBalanceMonthEntry,
} from "./coveragePlannerTypes";

export const DEFAULT_TARGET_MIN_OBSERVATIONS_PER_MONTH = DEFAULT_MIN_PERIOD_OBSERVATIONS;

const PROMISING_ROBUSTNESS_THRESHOLD = 55;

function isPromisingHypothesis(
  validation: HypothesisValidationEntry,
  monthPersistenceThreshold: number,
): boolean {
  return (
    validation.robustnessScore >= PROMISING_ROBUSTNESS_THRESHOLD
    || (
      validation.observationCount >= 50
      && validation.timeStability.monthPersistenceRate < monthPersistenceThreshold
    )
  );
}

function buildValidationBenefit(
  validation: HypothesisValidationEntry,
  thinMonths: readonly string[],
  monthPersistenceThreshold: number,
): HypothesisValidationBenefit {
  const thinMonthSet = new Set(thinMonths);
  const thinFolds = validation.leaveOnePeriodOut.folds.filter((fold) =>
    thinMonthSet.has(fold.excludedMonth),
  );
  const activeMonthCount =
    (validation.timeStability?.monthPeriods ?? []).filter((period) => period.observations > 0)
      .length;

  return {
    improvesMonthPersistence:
      validation.timeStability.monthPersistenceRate < monthPersistenceThreshold
      && thinMonths.length > 0,
    improvesLeaveOneMonthOutStability:
      thinMonths.length > 0
      && (
        validation.leaveOnePeriodOut.errorStdDev >= 0.05
        || thinFolds.some(
          (fold) => fold.remainingObservations < validation.observationCount * 0.4,
        )
      ),
    improvesSampleConcentration:
      thinMonths.length > 0
      && (
        validation.sampleConcentration.singleDayDominated
        || validation.sampleConcentration.largestDayPercent >= 0.35
        || validation.sampleConcentration.uniqueTradingDays < activeMonthCount * 4
      ),
  };
}

function formatValidationBenefit(
  benefit: HypothesisValidationBenefit,
): string {
  const parts: string[] = [];

  if (benefit.improvesMonthPersistence) {
    parts.push("month persistence");
  }
  if (benefit.improvesLeaveOneMonthOutStability) {
    parts.push("leave-one-month-out stability");
  }
  if (benefit.improvesSampleConcentration) {
    parts.push("sample concentration");
  }

  if (parts.length === 0) {
    return "Adds balanced monthly evidence for hypothesis validation.";
  }

  return `Expected to improve ${parts.join(", ")}.`;
}

function buildHypothesisTemporalBalance(
  validation: HypothesisValidationEntry,
  monthPersistenceThreshold: number,
  targetMinimumObservationsPerMonth: number,
): HypothesisTemporalBalanceEntry | null {
  const monthPeriods = validation.timeStability?.monthPeriods ?? [];
  const distribution = [...monthPeriods]
    .map((period) => ({
      month: period.periodKey,
      observations: period.observations,
    }))
    .sort((left, right) => left.month.localeCompare(right.month));

  if (distribution.length === 0) {
    return null;
  }

  const thinMonths = distribution
    .filter((entry) => entry.observations < targetMinimumObservationsPerMonth)
    .map((entry) => entry.month);

  const weakestMonths = [...distribution]
    .sort((left, right) => {
      const observationCompare = left.observations - right.observations;
      if (observationCompare !== 0) {
        return observationCompare;
      }

      return left.month.localeCompare(right.month);
    })
    .slice(0, Math.min(3, distribution.length))
    .map((entry) => entry.month);

  const validationBenefit = buildValidationBenefit(
    validation,
    thinMonths,
    monthPersistenceThreshold,
  );

  return {
    hypothesisId: validation.hypothesisId,
    hypothesis: validation.hypothesis,
    robustnessScore: validation.robustnessScore,
    monthObservationDistribution: distribution,
    weakestMonths,
    thinMonths,
    targetMinimumObservationsPerMonth,
    expectedValidationBenefit: formatValidationBenefit(validationBenefit),
    validationBenefit,
  };
}

function buildMonthDiagnostics(
  snapshot: CoverageSnapshot,
  artifacts: ParsedCoveragePlannerArtifacts,
  monthPersistenceThreshold: number,
): TemporalBalanceMonthEntry[] {
  const researchByMonth = new Map<string, number>();
  const qualifyingByMonth = new Map<string, number>();
  const validations = artifacts.hypothesisValidation?.validations ?? [];

  for (const validation of validations) {
    const promising = isPromisingHypothesis(validation, monthPersistenceThreshold);
    const monthPeriods = validation.timeStability?.monthPeriods ?? [];

    for (const period of monthPeriods) {
      researchByMonth.set(
        period.periodKey,
        (researchByMonth.get(period.periodKey) ?? 0) + period.observations,
      );

      if (promising) {
        qualifyingByMonth.set(
          period.periodKey,
          (qualifyingByMonth.get(period.periodKey) ?? 0) + period.observations,
        );
      }
    }
  }

  const months = new Set<string>([
    ...snapshot.monthCoverage.map((entry) => entry.month),
    ...researchByMonth.keys(),
  ]);

  return [...months]
    .sort((left, right) => left.localeCompare(right))
    .map((month) => {
      const snapshotMonth = snapshot.monthCoverage.find((entry) => entry.month === month);

      return {
        month,
        marketCount: snapshotMonth?.marketCount ?? 0,
        researchObservationCount: researchByMonth.get(month) ?? 0,
        qualifyingHypothesisObservationCount: qualifyingByMonth.get(month) ?? 0,
      };
    });
}

/** Builds temporal-balance diagnostics for coverage planning. */
export function buildTemporalBalanceDiagnostics(input: {
  snapshot: CoverageSnapshot;
  artifacts: ParsedCoveragePlannerArtifacts;
  monthPersistenceThreshold: number;
  targetMinimumObservationsPerMonth?: number;
}): TemporalBalanceDiagnostics {
  const targetMinimumObservationsPerMonth =
    input.targetMinimumObservationsPerMonth ?? DEFAULT_TARGET_MIN_OBSERVATIONS_PER_MONTH;
  const validations = input.artifacts.hypothesisValidation?.validations ?? [];

  const hypothesisBalances = validations
    .filter((validation) =>
      isPromisingHypothesis(validation, input.monthPersistenceThreshold),
    )
    .map((validation) =>
      buildHypothesisTemporalBalance(
        validation,
        input.monthPersistenceThreshold,
        targetMinimumObservationsPerMonth,
      ),
    )
    .filter((entry): entry is HypothesisTemporalBalanceEntry => entry !== null)
    .filter((entry) => entry.thinMonths.length > 0)
    .sort((left, right) => {
      const thinCompare = right.thinMonths.length - left.thinMonths.length;
      if (thinCompare !== 0) {
        return thinCompare;
      }

      return right.robustnessScore - left.robustnessScore;
    });

  const monthDiagnostics = buildMonthDiagnostics(
    input.snapshot,
    input.artifacts,
    input.monthPersistenceThreshold,
  );

  const thinMonthCount = new Set(
    hypothesisBalances.flatMap((entry) => entry.thinMonths),
  ).size;

  return {
    monthDiagnostics,
    hypothesisBalances,
    unevenHypothesisCount: hypothesisBalances.length,
    thinMonthCount,
    targetMinimumObservationsPerMonth,
  };
}

export { isPromisingHypothesis };
