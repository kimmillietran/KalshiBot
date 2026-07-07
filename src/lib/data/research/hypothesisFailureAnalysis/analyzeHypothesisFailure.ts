import type { HypothesisCandidate } from "@/lib/data/research/hypothesisCandidates/hypothesisCandidateTypes";
import type { CoverageAwareValidationEntry } from "@/lib/data/research/coverageAwareValidation/coverageAwareValidationTypes";
import type { CrossValidationEntry } from "@/lib/data/research/crossValidation/crossValidationTypes";
import type { HypothesisValidationEntry } from "@/lib/data/research/hypothesisRobustness/hypothesisRobustnessTypes";
import type { HypothesisHistoryDocument } from "@/lib/data/research/hypothesisEvolution/hypothesisEvolutionTypes";

import {
  DEFAULT_DERIVED_MONTH_DOMINANCE_THRESHOLD,
  DEFAULT_HIGH_LOO_STD_DEV_THRESHOLD,
  DEFAULT_LIKELY_SPURIOUS_ROBUSTNESS_CEILING,
  DEFAULT_MIN_MONTHS_FOR_JUDGMENT,
  DEFAULT_MIN_TRADING_DAYS_FOR_JUDGMENT,
  DEFAULT_NEAR_PROMISING_MAX_SCORE_GAP,
  DEFAULT_NEAR_PROMISING_ROBUSTNESS_FLOOR,
  DEFAULT_WEAK_MONTH_PERSISTENCE_THRESHOLD,
  type HypothesisFailureAnalysisEntry,
  type HypothesisFailureReason,
  type HypothesisFailureReasonCategory,
  type HypothesisPriorityCategory,
  type HypothesisRecommendedNextAction,
  type HypothesisStabilityDiagnostics,
  type MonthStabilitySnapshot,
} from "./hypothesisFailureAnalysisTypes";

const THIN_MONTH_OBSERVATION_THRESHOLD = 10;
const DERIVED_SETTLEMENT_MONTH = "2025-12";

export type AnalyzeHypothesisFailureContext = {
  validation: HypothesisValidationEntry;
  candidate: HypothesisCandidate | null;
  coverageEntry: CoverageAwareValidationEntry | null;
  crossValidation: CrossValidationEntry | null;
  hypothesisHistory: HypothesisHistoryDocument | null;
  passThreshold: number;
};

function monthSnapshots(validation: HypothesisValidationEntry): MonthStabilitySnapshot[] {
  const totalObservations = validation.observationCount;
  return validation.timeStability.monthPeriods
    .filter((period) => period.observations > 0)
    .map((period) => ({
      month: period.periodKey,
      observations: period.observations,
      edgeMatchesDirection: period.edgeMatchesDirection,
      signedCalibrationError: period.signedCalibrationError,
      observationShare:
        totalObservations > 0 ? period.observations / totalObservations : 0,
    }));
}

function buildStabilityDiagnostics(
  validation: HypothesisValidationEntry,
): HypothesisStabilityDiagnostics {
  const snapshots = monthSnapshots(validation);
  const sortedByStrength = [...snapshots].sort((left, right) => {
    const leftScore =
      (left.edgeMatchesDirection ? 1 : 0) * 100
      + Math.abs(left.signedCalibrationError ?? 0) * 50
      + left.observationShare * 20;
    const rightScore =
      (right.edgeMatchesDirection ? 1 : 0) * 100
      + Math.abs(right.signedCalibrationError ?? 0) * 50
      + right.observationShare * 20;
    return rightScore - leftScore;
  });

  const sortedByWeakness = [...snapshots].sort((left, right) => {
    const leftWeakness =
      (left.edgeMatchesDirection ? 0 : 1) * 100
      + Math.abs(left.signedCalibrationError ?? 0) * 30
      + left.observationShare * 10;
    const rightWeakness =
      (right.edgeMatchesDirection ? 0 : 1) * 100
      + Math.abs(right.signedCalibrationError ?? 0) * 30
      + right.observationShare * 10;
    return rightWeakness - leftWeakness;
  });

  const missingOrThinMonths = snapshots
    .filter(
      (snapshot) =>
        snapshot.observations < THIN_MONTH_OBSERVATION_THRESHOLD
        || !snapshot.edgeMatchesDirection,
    )
    .map((snapshot) => snapshot.month);

  const edgeMonths = snapshots.filter((snapshot) => snapshot.edgeMatchesDirection);
  const signalBreadth: HypothesisStabilityDiagnostics["signalBreadth"] =
    edgeMonths.length === 0
      ? "narrow"
      : edgeMonths.length >= Math.max(3, Math.ceil(snapshots.length * 0.6))
        ? "broad"
        : edgeMonths.length <= 1
          ? "narrow"
          : "mixed";

  const monthCount = snapshots.length;

  return {
    strongestMonths: sortedByStrength.slice(0, 3),
    weakestMonths: sortedByWeakness.slice(0, 3),
    missingOrThinMonths,
    highConcentrationDays: validation.sampleConcentration.largestContributingDay
      ? [{
        day: validation.sampleConcentration.largestContributingDay,
        observations: validation.sampleConcentration.largestDayObservations,
        percent: validation.sampleConcentration.largestDayPercent,
      }]
      : [],
    signalBreadth,
    monthPersistenceRate: validation.timeStability.monthPersistenceRate,
    quarterPersistenceRate: validation.timeStability.quarterPersistenceRate,
    uniqueTradingDays: validation.sampleConcentration.uniqueTradingDays,
    monthCount,
    leaveOnePeriodOutStdDev: validation.leaveOnePeriodOut.errorStdDev,
    regimesWithData: validation.regimeStability.regimesWithData,
    regimesWithEdge: validation.regimeStability.regimesWithEdge,
  };
}

function hasDerivedDataSensitivity(
  validation: HypothesisValidationEntry,
  stability: HypothesisStabilityDiagnostics,
): boolean {
  const derivedMonth = stability.strongestMonths.find(
    (month) => month.month === DERIVED_SETTLEMENT_MONTH,
  );

  return (
    derivedMonth !== undefined
    && derivedMonth.edgeMatchesDirection
    && derivedMonth.observationShare >= DEFAULT_DERIVED_MONTH_DOMINANCE_THRESHOLD
  );
}

function addReason(
  reasons: HypothesisFailureReason[],
  category: HypothesisFailureReasonCategory,
  summary: string,
  detail: string | null = null,
): void {
  if (reasons.some((reason) => reason.category === category)) {
    return;
  }

  reasons.push({ category, summary, detail });
}

function buildFailureReasons(
  context: AnalyzeHypothesisFailureContext,
  stability: HypothesisStabilityDiagnostics,
): HypothesisFailureReason[] {
  const { validation, coverageEntry, crossValidation, passThreshold } = context;
  const reasons: HypothesisFailureReason[] = [];

  if (!validation.passes) {
    addReason(
      reasons,
      "below-pass-threshold",
      `Robustness score ${validation.robustnessScore} is below the pass threshold (${passThreshold}).`,
      `Score gap: ${Math.max(0, passThreshold - validation.robustnessScore)} points.`,
    );
  }

  const minObservations = coverageEntry?.metrics.observationCount !== undefined
    ? 6
    : 6;
  if (validation.observationCount < minObservations) {
    addReason(
      reasons,
      "insufficient-observations",
      `Only ${validation.observationCount} observations; more market samples are needed.`,
      coverageEntry?.missingCoverageExplanation ?? null,
    );
  }

  if (stability.uniqueTradingDays < DEFAULT_MIN_TRADING_DAYS_FOR_JUDGMENT) {
    addReason(
      reasons,
      "insufficient-trading-days",
      `Only ${stability.uniqueTradingDays} unique trading days (need ${DEFAULT_MIN_TRADING_DAYS_FOR_JUDGMENT}).`,
      "Additional independent trading days would reduce single-window bias.",
    );
  }

  if (stability.monthPersistenceRate < DEFAULT_WEAK_MONTH_PERSISTENCE_THRESHOLD) {
    addReason(
      reasons,
      "poor-month-stability",
      `Month-level edge persistence is weak (${Math.round(stability.monthPersistenceRate * 100)}%).`,
      `Strongest months: ${stability.strongestMonths.map((month) => month.month).join(", ") || "none"}.`,
    );
  }

  if (stability.leaveOnePeriodOutStdDev >= DEFAULT_HIGH_LOO_STD_DEV_THRESHOLD) {
    addReason(
      reasons,
      "poor-leave-one-period-out",
      `Leave-one-month-out calibration error std dev is ${stability.leaveOnePeriodOutStdDev.toFixed(3)} (high variance).`,
      "Signal may not survive removing individual calendar months.",
    );
  }

  const regimeReason = validation.reasons.find((reason) =>
    reason.toLowerCase().includes("regime"),
  );
  if (
    stability.regimesWithEdge <= 1
    && stability.regimesWithData > 0
    && stability.regimesWithData < 3
  ) {
    addReason(
      reasons,
      "regime-instability",
      "Edge is concentrated in a single volatility regime or regime coverage is sparse.",
      regimeReason ?? null,
    );
  } else if (stability.regimesWithData === 0) {
    addReason(
      reasons,
      "regime-instability",
      "Regime tags unavailable or no regime buckets have data.",
      regimeReason ?? "Cannot confirm the edge holds across volatility regimes.",
    );
  }

  if (
    validation.sampleConcentration.singleDayDominated
    || validation.sampleConcentration.largestDayPercent >= 50
  ) {
    addReason(
      reasons,
      "sample-concentration",
      `Sample concentration risk: ${validation.sampleConcentration.largestDayPercent.toFixed(1)}% of observations come from ${validation.sampleConcentration.largestContributingDay ?? "one day"}.`,
      null,
    );
  }

  if (hasDerivedDataSensitivity(validation, stability)) {
    const derivedMonth = stability.strongestMonths.find(
      (month) => month.month === DERIVED_SETTLEMENT_MONTH,
    );
    addReason(
      reasons,
      "derived-data-sensitivity",
      `Dec 2025 derived-settlement data may influence the signal (${Math.round((derivedMonth?.observationShare ?? 0) * 100)}% of observations).`,
      "Confirm the edge persists outside months relying on derived expiration_value.",
    );
  }

  const calibrationReason = validation.reasons.find((reason) =>
    reason.toLowerCase().includes("calibration")
    || reason.toLowerCase().includes("persistence"),
  );
  if (
    stability.monthPersistenceRate < DEFAULT_WEAK_MONTH_PERSISTENCE_THRESHOLD
    && calibrationReason
  ) {
    addReason(
      reasons,
      "weak-calibration-gap",
      "Calibration edge is unstable or reverses across time buckets.",
      calibrationReason,
    );
  }

  if (crossValidation && !crossValidation.overallPasses) {
    addReason(
      reasons,
      "cross-validation-failure",
      "Cross-validation did not pass all stability methods.",
      null,
    );
  }

  for (const reason of validation.reasons) {
    if (reason.toLowerCase().includes("below promotion threshold")) {
      continue;
    }

    const alreadyCovered = reasons.some((entry) =>
      entry.detail === reason || entry.summary.includes(reason.slice(0, 24)),
    );
    if (!alreadyCovered && reasons.length < 8) {
      const category = reason.toLowerCase().includes("concentration")
        ? "sample-concentration"
        : reason.toLowerCase().includes("regime")
          ? "regime-instability"
          : reason.toLowerCase().includes("persistence")
            ? "poor-month-stability"
            : "weak-calibration-gap";
      addReason(reasons, category, reason, null);
    }
  }

  return reasons;
}

function buildMarginalEvidenceNeeds(
  context: AnalyzeHypothesisFailureContext,
  stability: HypothesisStabilityDiagnostics,
  failureReasons: readonly HypothesisFailureReason[],
): string[] {
  const needs: string[] = [];
  const categories = new Set(failureReasons.map((reason) => reason.category));

  if (
    categories.has("insufficient-observations")
    || categories.has("insufficient-trading-days")
    || stability.monthCount < DEFAULT_MIN_MONTHS_FOR_JUDGMENT
  ) {
    needs.push("Needs more observations in under-covered months.");
  }

  if (categories.has("insufficient-trading-days")) {
    needs.push("Needs additional independent trading days.");
  }

  if (categories.has("regime-instability")) {
    needs.push("Needs validation outside the dominant volatility regime.");
  }

  if (categories.has("poor-month-stability") || categories.has("weak-calibration-gap")) {
    needs.push("Needs confirmation that the edge persists across multiple calendar months.");
  }

  if (categories.has("derived-data-sensitivity")) {
    needs.push(
      "Needs confirmation that Dec 2025 derived-settlement data does not dominate the signal.",
    );
  }

  if (categories.has("poor-leave-one-period-out")) {
    needs.push("Needs leave-one-period-out stability after expanding temporal coverage.");
  }

  if (categories.has("sample-concentration")) {
    needs.push("Needs broader day-level sampling to reduce concentration risk.");
  }

  if (categories.has("cross-validation-failure")) {
    needs.push("Needs cross-validation confirmation across rolling and bootstrap folds.");
  }

  if (needs.length === 0 && !context.validation.passes) {
    needs.push("Needs additional robustness headroom before promotion consideration.");
  }

  return [...new Set(needs)];
}

export function computeHypothesisPriorityScore(input: {
  robustnessScore: number;
  scoreGap: number;
  observationCount: number;
  uniqueTradingDays: number;
  monthPersistenceRate: number;
  quarterPersistenceRate: number;
  largestDayPercent: number;
  singleDayDominated: boolean;
  crossValidationPasses: boolean | null;
  hasStrategyFamily: boolean;
}): number {
  let score =
    input.robustnessScore * 2
    - input.scoreGap * 1.5
    + Math.min(input.observationCount / 50, 10)
    + Math.min(input.uniqueTradingDays / 10, 10)
    + input.monthPersistenceRate * 15
    + input.quarterPersistenceRate * 10
    - input.largestDayPercent / 5;

  if (input.singleDayDominated) {
    score -= 20;
  }

  if (input.crossValidationPasses === true) {
    score += 10;
  } else if (input.crossValidationPasses === false) {
    score -= 5;
  }

  if (input.hasStrategyFamily) {
    score += 3;
  }

  return Math.round(score * 100) / 100;
}

export function classifyHypothesisPriorityCategory(input: {
  passes: boolean;
  robustnessScore: number;
  scoreGap: number;
  coverageClassification: string | null;
  singleDayDominated: boolean;
  monthPersistenceRate: number;
  uniqueTradingDays: number;
  monthCount: number;
}): HypothesisPriorityCategory {
  if (input.passes) {
    return "near-promising";
  }

  if (
    input.coverageClassification === "inconclusive-insufficient-coverage"
    || input.uniqueTradingDays < DEFAULT_MIN_TRADING_DAYS_FOR_JUDGMENT
    || input.monthCount < DEFAULT_MIN_MONTHS_FOR_JUDGMENT
  ) {
    return "blocked-by-coverage";
  }

  if (
    input.coverageClassification === "rejected"
    || input.robustnessScore < DEFAULT_LIKELY_SPURIOUS_ROBUSTNESS_CEILING
    || (input.singleDayDominated && input.monthPersistenceRate < 0.3)
  ) {
    return "likely-spurious";
  }

  if (
    input.robustnessScore >= DEFAULT_NEAR_PROMISING_ROBUSTNESS_FLOOR
    && input.scoreGap <= DEFAULT_NEAR_PROMISING_MAX_SCORE_GAP
  ) {
    return "near-promising";
  }

  return "needs-more-data";
}

export function resolveRecommendedNextAction(input: {
  priorityCategory: HypothesisPriorityCategory;
  robustnessScore: number;
  scoreGap: number;
  failureReasons: readonly HypothesisFailureReason[];
  hasDerivedSensitivity: boolean;
  historyWeakening: boolean;
}): HypothesisRecommendedNextAction {
  const categories = new Set(input.failureReasons.map((reason) => reason.category));

  if (input.priorityCategory === "blocked-by-coverage") {
    return "collect-more-data";
  }

  if (input.hasDerivedSensitivity || categories.has("derived-data-sensitivity")) {
    return "inspect-derived-data-sensitivity";
  }

  if (
    categories.has("poor-month-stability")
    || categories.has("weak-calibration-gap")
    || categories.has("poor-leave-one-period-out")
  ) {
    return "inspect-month-breakdown";
  }

  if (input.priorityCategory === "likely-spurious") {
    return input.historyWeakening ? "retire-if-next-batch-fails" : "lower-priority";
  }

  if (
    input.priorityCategory === "near-promising"
    && input.robustnessScore >= 55
    && input.scoreGap <= 15
  ) {
    return "strategy-synthesis-investigation";
  }

  if (categories.has("insufficient-observations") || categories.has("insufficient-trading-days")) {
    return "collect-more-data";
  }

  if (input.priorityCategory === "near-promising") {
    return "inspect-month-breakdown";
  }

  return "collect-more-data";
}

function historyShowsWeakening(
  hypothesisId: string,
  history: HypothesisHistoryDocument | null,
): boolean {
  if (!history || history.runs.length < 2) {
    return false;
  }

  const sortedRuns = [...history.runs].sort((left, right) =>
    left.runId.localeCompare(right.runId),
  );
  const latest = sortedRuns.at(-1)?.snapshotsByHypothesisId[hypothesisId];
  const previous = sortedRuns.at(-2)?.snapshotsByHypothesisId[hypothesisId];

  if (!latest || !previous) {
    return false;
  }

  return latest.robustnessScore < previous.robustnessScore - 5;
}

/** Builds a read-only failure analysis entry for one hypothesis validation record. */
export function analyzeHypothesisFailure(
  context: AnalyzeHypothesisFailureContext,
): HypothesisFailureAnalysisEntry {
  const {
    validation,
    candidate,
    coverageEntry,
    crossValidation,
    hypothesisHistory,
    passThreshold,
  } = context;

  const scoreGap = Math.max(0, passThreshold - validation.robustnessScore);
  const stability = buildStabilityDiagnostics(validation);
  const failureReasons = validation.passes
    ? []
    : buildFailureReasons(context, stability);
  const hasDerivedSensitivity = hasDerivedDataSensitivity(validation, stability);
  const marginalEvidenceNeeds = validation.passes
    ? []
    : buildMarginalEvidenceNeeds(context, stability, failureReasons);

  const priorityScore = computeHypothesisPriorityScore({
    robustnessScore: validation.robustnessScore,
    scoreGap,
    observationCount: validation.observationCount,
    uniqueTradingDays: stability.uniqueTradingDays,
    monthPersistenceRate: stability.monthPersistenceRate,
    quarterPersistenceRate: stability.quarterPersistenceRate,
    largestDayPercent: validation.sampleConcentration.largestDayPercent,
    singleDayDominated: validation.sampleConcentration.singleDayDominated,
    crossValidationPasses: crossValidation?.overallPasses ?? null,
    hasStrategyFamily: Boolean(candidate?.suggestedStrategyFamily),
  });

  const priorityCategory = classifyHypothesisPriorityCategory({
    passes: validation.passes,
    robustnessScore: validation.robustnessScore,
    scoreGap,
    coverageClassification: coverageEntry?.classification ?? null,
    singleDayDominated: validation.sampleConcentration.singleDayDominated,
    monthPersistenceRate: stability.monthPersistenceRate,
    uniqueTradingDays: stability.uniqueTradingDays,
    monthCount: stability.monthCount,
  });

  const recommendedNextAction = validation.passes
    ? "strategy-synthesis-investigation"
    : resolveRecommendedNextAction({
      priorityCategory,
      robustnessScore: validation.robustnessScore,
      scoreGap,
      failureReasons,
      hasDerivedSensitivity,
      historyWeakening: historyShowsWeakening(validation.hypothesisId, hypothesisHistory),
    });

  const notes: string[] = [];
  if (candidate?.expectedFailureMode) {
    notes.push(`Expected failure mode: ${candidate.expectedFailureMode}`);
  }
  if (candidate?.killCriterion) {
    notes.push(`Kill criterion: ${candidate.killCriterion}`);
  }
  if (coverageEntry?.missingCoverageExplanation) {
    notes.push(`Coverage note: ${coverageEntry.missingCoverageExplanation}`);
  }

  return {
    hypothesisId: validation.hypothesisId,
    hypothesis: validation.hypothesis,
    passes: validation.passes,
    robustnessScore: validation.robustnessScore,
    passThreshold,
    scoreGap,
    observationCount: validation.observationCount,
    uniqueTradingDays: stability.uniqueTradingDays,
    priorityRank: 0,
    priorityCategory,
    priorityScore,
    recommendedNextAction,
    failureReasons,
    stabilityDiagnostics: stability,
    marginalEvidenceNeeds,
    notes,
    suggestedStrategyFamily: candidate?.suggestedStrategyFamily ?? null,
    coverageClassification: coverageEntry?.classification ?? null,
    crossValidationPasses: crossValidation?.overallPasses ?? null,
  };
}

export function rankHypothesisFailureAnalyses(
  analyses: HypothesisFailureAnalysisEntry[],
): HypothesisFailureAnalysisEntry[] {
  const sorted = [...analyses].sort((left, right) => {
    const scoreCompare = right.priorityScore - left.priorityScore;
    if (scoreCompare !== 0) {
      return scoreCompare;
    }

    const gapCompare = left.scoreGap - right.scoreGap;
    if (gapCompare !== 0) {
      return gapCompare;
    }

    return left.hypothesisId.localeCompare(right.hypothesisId);
  });

  return sorted.map((entry, index) => ({
    ...entry,
    priorityRank: index + 1,
  }));
}
