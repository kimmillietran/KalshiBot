import type { HypothesisValidationEntry } from "@/lib/data/research/hypothesisRobustness/hypothesisRobustnessTypes";
import type { CrossValidationEntry } from "@/lib/data/research/crossValidation/crossValidationTypes";

import {
  DEFAULT_MIN_MONTHS_FOR_JUDGMENT,
  DEFAULT_MIN_OBSERVATIONS_FOR_JUDGMENT,
  DEFAULT_MIN_REGIMES_FOR_JUDGMENT,
  DEFAULT_MIN_TRADING_DAYS_FOR_JUDGMENT,
  DEFAULT_PROMISING_ROBUSTNESS_FLOOR,
} from "./coverageAwareValidationTypes";
import type {
  CoverageAwareValidationClassification,
  CoverageAwareValidationMetrics,
  CoverageAwareValidationThresholds,
  HistoricalCoveragePlan,
  RecommendedImportWindow,
} from "./coverageAwareValidationTypes";

export function resolveCoverageThresholds(
  plan: HistoricalCoveragePlan | null,
): CoverageAwareValidationThresholds {
  const planThresholds = plan?.thresholds;

  return {
    minMonths: planThresholds?.minMonths ?? DEFAULT_MIN_MONTHS_FOR_JUDGMENT,
    minTradingDays: planThresholds?.minTradingDays ?? DEFAULT_MIN_TRADING_DAYS_FOR_JUDGMENT,
    minObservations: planThresholds?.minObservations ?? DEFAULT_MIN_OBSERVATIONS_FOR_JUDGMENT,
    minRegimesWithData:
      planThresholds?.minRegimesWithData ?? DEFAULT_MIN_REGIMES_FOR_JUDGMENT,
    minRobustnessScore: planThresholds?.minRobustnessScore ?? 70,
    promisingRobustnessFloor:
      planThresholds?.promisingRobustnessFloor ?? DEFAULT_PROMISING_ROBUSTNESS_FLOOR,
  };
}

export function extractCoverageMetrics(
  validation: HypothesisValidationEntry,
  crossValidation: CrossValidationEntry | null,
): CoverageAwareValidationMetrics {
  const monthCount = validation.timeStability.monthPeriods.filter(
    (period) => period.observations > 0,
  ).length;
  const sparseRegimes = validation.regimeStability.regimes
    .filter((regime) => regime.observations === 0)
    .map((regime) => regime.regime);

  return {
    observationCount: validation.observationCount,
    uniqueTradingDays: validation.sampleConcentration.uniqueTradingDays,
    monthCount,
    regimeCoverage: {
      regimesWithData: validation.regimeStability.regimesWithData,
      regimesWithEdge: validation.regimeStability.regimesWithEdge,
      sparseRegimes,
    },
    robustnessScore: validation.robustnessScore,
    largestDayPercent: validation.sampleConcentration.largestDayPercent,
    singleDayDominated: validation.sampleConcentration.singleDayDominated,
    crossValidationPasses: crossValidation?.overallPasses ?? null,
  };
}

function hasInsufficientCoverage(
  metrics: CoverageAwareValidationMetrics,
  thresholds: CoverageAwareValidationThresholds,
): boolean {
  return (
    metrics.observationCount < thresholds.minObservations
    || metrics.uniqueTradingDays < thresholds.minTradingDays
    || metrics.monthCount < thresholds.minMonths
    || metrics.singleDayDominated
  );
}

function hasRegimeSparseCoverage(
  metrics: CoverageAwareValidationMetrics,
  thresholds: CoverageAwareValidationThresholds,
): boolean {
  return metrics.regimeCoverage.regimesWithData < thresholds.minRegimesWithData;
}

function hasPromisingEdgeSignals(
  validation: HypothesisValidationEntry,
  metrics: CoverageAwareValidationMetrics,
  thresholds: CoverageAwareValidationThresholds,
  crossValidation: CrossValidationEntry | null,
): boolean {
  if (metrics.robustnessScore >= thresholds.promisingRobustnessFloor) {
    return true;
  }

  if (
    metrics.robustnessScore >= 40
    && validation.timeStability.monthPersistenceRate >= 0.67
  ) {
    return true;
  }

  if (crossValidation?.methods) {
    const timeMethodsPass =
      crossValidation.methods.expandingWindow.passes
      || crossValidation.methods.rollingWindow.passes;
    const calibrationMethodsPass =
      crossValidation.methods.leaveOneRegimeOut.passes
      || crossValidation.methods.randomBootstrap.passes;

    if (!timeMethodsPass && calibrationMethodsPass) {
      return true;
    }
  }

  return false;
}

function buildMissingCoverageExplanation(input: {
  classification: CoverageAwareValidationClassification;
  metrics: CoverageAwareValidationMetrics;
  thresholds: CoverageAwareValidationThresholds;
}): string {
  const { classification, metrics, thresholds } = input;
  const gaps: string[] = [];

  if (metrics.observationCount < thresholds.minObservations) {
    gaps.push(
      `Only ${metrics.observationCount} observations (need ${thresholds.minObservations}).`,
    );
  }

  if (metrics.uniqueTradingDays < thresholds.minTradingDays) {
    gaps.push(
      `Only ${metrics.uniqueTradingDays} trading days (need ${thresholds.minTradingDays}).`,
    );
  }

  if (metrics.monthCount < thresholds.minMonths) {
    gaps.push(`Only ${metrics.monthCount} months with data (need ${thresholds.minMonths}).`);
  }

  if (metrics.singleDayDominated) {
    gaps.push(
      `Sample is dominated by one day (${metrics.largestDayPercent.toFixed(1)}% of observations).`,
    );
  }

  if (
    classification === "inconclusive-regime-sparse"
    || metrics.regimeCoverage.regimesWithData < thresholds.minRegimesWithData
  ) {
    gaps.push(
      `Volatility regime coverage is sparse (${metrics.regimeCoverage.regimesWithData}/${thresholds.minRegimesWithData} regimes with data).`,
    );
    if (metrics.regimeCoverage.sparseRegimes.length > 0) {
      gaps.push(`Missing regime buckets: ${metrics.regimeCoverage.sparseRegimes.join(", ")}.`);
    }
  }

  if (classification === "rejected") {
    return gaps.length > 0
      ? `${gaps.join(" ")} Edge failed validation despite adequate calendar coverage.`
      : "Coverage is adequate, but calibration edge and robustness metrics failed validation.";
  }

  if (classification === "promising-needs-more-history") {
    return gaps.length > 0
      ? `${gaps.join(" ")} Partial edge signals exist; import more history before rejecting.`
      : "Calendar coverage is borderline or time-stability checks failed while calibration direction looks promising.";
  }

  if (classification === "robust-enough-to-test") {
    return "Coverage and robustness metrics are sufficient for downstream strategy testing.";
  }

  return gaps.length > 0
    ? gaps.join(" ")
    : "Coverage is too limited to judge whether the hypothesis edge is real.";
}

export function recommendImportWindows(input: {
  classification: CoverageAwareValidationClassification;
  metrics: CoverageAwareValidationMetrics;
  coveragePlan: HistoricalCoveragePlan | null;
}): RecommendedImportWindow[] {
  const windows: RecommendedImportWindow[] = [];

  if (input.coveragePlan) {
    windows.push(...input.coveragePlan.recommendedImportWindows);
  }

  if (
    input.classification === "inconclusive-regime-sparse"
    && input.metrics.regimeCoverage.sparseRegimes.length > 0
  ) {
    windows.push({
      windowId: `regime-gap-${input.metrics.regimeCoverage.sparseRegimes.join("-")}`,
      label: `Regime coverage: ${input.metrics.regimeCoverage.sparseRegimes.join(", ")}`,
      startDate: input.coveragePlan?.currentCoverage.latestTradingDayUtc ?? "unknown",
      endDate: "extend-forward",
      rationale:
        "Import additional windows that include the missing volatility regimes before judging edge stability.",
      priority: "high",
    });
  }

  if (input.metrics.monthCount < (input.coveragePlan?.thresholds.minMonths ?? DEFAULT_MIN_MONTHS_FOR_JUDGMENT)) {
    windows.push({
      windowId: "extend-calendar-months",
      label: "Extend multi-month calendar coverage",
      startDate: input.coveragePlan?.currentCoverage.earliestTradingDayUtc ?? "unknown",
      endDate: input.coveragePlan?.currentCoverage.latestTradingDayUtc ?? "unknown",
      rationale:
        "Hypothesis validation requires additional non-overlapping months to distinguish edge from sampling noise.",
      priority: "high",
    });
  }

  const deduped = new Map<string, RecommendedImportWindow>();
  for (const window of windows) {
    deduped.set(window.windowId, window);
  }

  return [...deduped.values()].sort((left, right) => {
    const priorityRank = { high: 0, medium: 1, low: 2 } as const;
    const priorityCompare =
      priorityRank[left.priority] - priorityRank[right.priority];
    if (priorityCompare !== 0) {
      return priorityCompare;
    }

    return left.label.localeCompare(right.label);
  });
}

export function classifyCoverageAwareValidation(input: {
  validation: HypothesisValidationEntry;
  crossValidation: CrossValidationEntry | null;
  thresholds: CoverageAwareValidationThresholds;
}): CoverageAwareValidationClassification {
  const metrics = extractCoverageMetrics(input.validation, input.crossValidation);

  if (input.validation.observationCount === 0) {
    return "inconclusive-insufficient-coverage";
  }

  if (hasInsufficientCoverage(metrics, input.thresholds)) {
    if (
      hasPromisingEdgeSignals(
        input.validation,
        metrics,
        input.thresholds,
        input.crossValidation,
      )
      && metrics.monthCount >= Math.max(1, input.thresholds.minMonths - 1)
    ) {
      return "promising-needs-more-history";
    }

    return "inconclusive-insufficient-coverage";
  }

  if (hasRegimeSparseCoverage(metrics, input.thresholds)) {
    return "inconclusive-regime-sparse";
  }

  if (
    input.validation.passes
    && metrics.robustnessScore >= input.thresholds.minRobustnessScore
  ) {
    return "robust-enough-to-test";
  }

  if (
    hasPromisingEdgeSignals(
      input.validation,
      metrics,
      input.thresholds,
      input.crossValidation,
    )
    && input.crossValidation !== null
    && input.crossValidation.overallPasses === false
  ) {
    return "promising-needs-more-history";
  }

  return "rejected";
}

export function buildAdvisoryNotes(input: {
  classification: CoverageAwareValidationClassification;
  validation: HypothesisValidationEntry;
  crossValidation: CrossValidationEntry | null;
}): string[] {
  const notes = [
    "Advisory classification only; hypothesis-validation scores and promotion logic are unchanged.",
  ];

  if (input.classification === "rejected") {
    notes.push("Validation failed with sufficient coverage — treat as a weak-edge rejection.");
  }

  if (input.crossValidation && input.crossValidation.overallPasses === false) {
    notes.push("Cross-validation did not pass all methods; review time-stability folds.");
  }

  if (input.validation.reasons.length > 0) {
    notes.push(`Upstream validation note: ${input.validation.reasons[0]}`);
  }

  return notes;
}

export function buildCoverageAwareEntry(input: {
  validation: HypothesisValidationEntry;
  crossValidation: CrossValidationEntry | null;
  thresholds: CoverageAwareValidationThresholds;
  coveragePlan: HistoricalCoveragePlan | null;
}): {
  classification: CoverageAwareValidationClassification;
  metrics: CoverageAwareValidationMetrics;
  missingCoverageExplanation: string;
  recommendedImportWindows: RecommendedImportWindow[];
  advisoryNotes: string[];
} {
  const classification = classifyCoverageAwareValidation(input);
  const metrics = extractCoverageMetrics(input.validation, input.crossValidation);
  const missingCoverageExplanation = buildMissingCoverageExplanation({
    classification,
    metrics,
    thresholds: input.thresholds,
  });

  return {
    classification,
    metrics,
    missingCoverageExplanation,
    recommendedImportWindows: recommendImportWindows({
      classification,
      metrics,
      coveragePlan: input.coveragePlan,
    }),
    advisoryNotes: buildAdvisoryNotes({
      classification,
      validation: input.validation,
      crossValidation: input.crossValidation,
    }),
  };
}
