import type { HypothesisValidationEntry } from "@/lib/data/research/hypothesisRobustness/hypothesisRobustnessTypes";

import {
  DEFAULT_DOMINATED_DERIVED_SHARE_THRESHOLD,
  DEFAULT_HIGH_ROBUSTNESS_DELTA_THRESHOLD,
  DEFAULT_MODERATE_ROBUSTNESS_DELTA_THRESHOLD,
  DEFAULT_ROBUST_ROBUSTNESS_DELTA_THRESHOLD,
  type DerivedSensitivityRecommendation,
  type DerivedSettlementSensitivityEntry,
  type DerivedSettlementSensitivityMetrics,
} from "./derivedSettlementSensitivityTypes";

export function classifyDerivedSensitivityRecommendation(input: {
  deltaRobustness: number;
  derivedObservationShare: number;
  officialObservationCount: number;
  allObservationCount: number;
}): DerivedSensitivityRecommendation {
  const robustnessDrop = -input.deltaRobustness;

  if (
    input.derivedObservationShare >= DEFAULT_DOMINATED_DERIVED_SHARE_THRESHOLD
    && robustnessDrop >= DEFAULT_MODERATE_ROBUSTNESS_DELTA_THRESHOLD
  ) {
    return "dominated-by-derived-data";
  }

  if (
    input.derivedObservationShare === 0
    || robustnessDrop < DEFAULT_ROBUST_ROBUSTNESS_DELTA_THRESHOLD
  ) {
    return "robust";
  }

  if (robustnessDrop >= DEFAULT_HIGH_ROBUSTNESS_DELTA_THRESHOLD) {
    return "highly-sensitive";
  }

  if (robustnessDrop >= DEFAULT_MODERATE_ROBUSTNESS_DELTA_THRESHOLD) {
    return "moderately-sensitive";
  }

  return "robust";
}

function roundDelta(value: number): number {
  return Math.round(value * 100) / 100;
}

function computeDeltaCalibration(
  allCalibration: number | null,
  officialCalibration: number | null,
): number | null {
  if (allCalibration === null || officialCalibration === null) {
    return null;
  }

  return roundDelta(officialCalibration - allCalibration);
}

function buildNotes(input: {
  recommendation: DerivedSensitivityRecommendation;
  deltaRobustness: number;
  derivedObservationShare: number;
  allPasses: boolean;
  officialPasses: boolean;
}): string[] {
  const notes: string[] = [];

  if (input.derivedObservationShare === 0) {
    notes.push("No derived-settlement observations matched this hypothesis bucket.");
    return notes;
  }

  notes.push(
    `${Math.round(input.derivedObservationShare * 100)}% of observations use derived expiration_value settlements.`,
  );

  if (input.deltaRobustness > 0) {
    notes.push(
      `Robustness improves by ${input.deltaRobustness} points when derived settlements are excluded.`,
    );
  } else if (input.deltaRobustness < 0) {
    notes.push(
      `Robustness drops by ${Math.abs(input.deltaRobustness)} points when derived settlements are excluded.`,
    );
  }

  if (input.allPasses !== input.officialPasses) {
    notes.push(
      input.officialPasses
        ? "Hypothesis would pass using official settlements only."
        : "Hypothesis still fails after excluding derived settlements.",
    );
  }

  switch (input.recommendation) {
    case "dominated-by-derived-data":
      notes.push("Signal appears dominated by derived-settlement markets; treat with caution.");
      break;
    case "highly-sensitive":
      notes.push("Robustness is highly sensitive to derived settlement inputs.");
      break;
    case "moderately-sensitive":
      notes.push("Derived settlements materially influence validation metrics.");
      break;
    case "robust":
      notes.push("Hypothesis metrics are stable after excluding derived settlements.");
      break;
  }

  return notes;
}

/** Builds a sensitivity comparison entry for one hypothesis. */
export function analyzeDerivedSettlementSensitivity(input: {
  allValidation: HypothesisValidationEntry;
  officialValidation: HypothesisValidationEntry;
  allCalibration: number | null;
  officialCalibration: number | null;
}): DerivedSettlementSensitivityEntry {
  const allCount = input.allValidation.observationCount;
  const officialCount = input.officialValidation.observationCount;
  const derivedCount = Math.max(0, allCount - officialCount);
  const derivedShare = allCount > 0 ? derivedCount / allCount : 0;

  const allMetrics: DerivedSettlementSensitivityMetrics = {
    observationCount: allCount,
    derivedObservationCount: derivedCount,
    officialObservationCount: officialCount,
    derivedObservationShare: roundDelta(derivedShare),
    robustnessScore: input.allValidation.robustnessScore,
    signedCalibrationError: input.allCalibration,
    passes: input.allValidation.passes,
  };

  const officialMetrics: DerivedSettlementSensitivityMetrics = {
    observationCount: officialCount,
    derivedObservationCount: 0,
    officialObservationCount: officialCount,
    derivedObservationShare: 0,
    robustnessScore: input.officialValidation.robustnessScore,
    signedCalibrationError: input.officialCalibration,
    passes: input.officialValidation.passes,
  };

  const deltaRobustness = roundDelta(
    officialMetrics.robustnessScore - allMetrics.robustnessScore,
  );
  const deltaCalibration = computeDeltaCalibration(
    allMetrics.signedCalibrationError,
    officialMetrics.signedCalibrationError,
  );

  const recommendation = classifyDerivedSensitivityRecommendation({
    deltaRobustness,
    derivedObservationShare: derivedShare,
    officialObservationCount: officialCount,
    allObservationCount: allCount,
  });

  return {
    hypothesisId: input.allValidation.hypothesisId,
    hypothesis: input.allValidation.hypothesis,
    allObservations: allMetrics,
    officialOnlyObservations: officialMetrics,
    deltaRobustness,
    deltaCalibration,
    recommendation,
    notes: buildNotes({
      recommendation,
      deltaRobustness,
      derivedObservationShare: derivedShare,
      allPasses: allMetrics.passes,
      officialPasses: officialMetrics.passes,
    }),
  };
}
