import type {
  CalibrationFadeCalibrationMetrics,
  CalibrationFadeExecutableMetrics,
  CalibrationFadeSettlementCoverage,
  FrozenHypothesisSpec,
} from "@/lib/data/research/calibrationFadeForwardValidation/calibrationFadeForwardValidationTypes";

import { classifyExecutableEvidence } from "@/lib/data/research/calibrationFadeForwardValidation";

import type {
  CalibrationFadeCrossRunClassification,
  CalibrationFadeCrossRunRecommendedNextAction,
  CrossRunRunSummary,
} from "./calibrationFadeCrossRunValidationTypes";
import {
  describeSelectedRunHealthFailure,
  isSelectedRunResearchReady,
} from "./isSelectedRunResearchReady";

export function classifyCalibrationFadeCrossRun(input: {
  spec: FrozenHypothesisSpec;
  provenanceAvailable: boolean;
  runSetIncompatible: boolean;
  candidateParsingErrorCount?: number;
  perRunSummaries: readonly CrossRunRunSummary[];
  uniqueCandidateMarketCount: number;
  settlementCoverage: CalibrationFadeSettlementCoverage;
  calibration: CalibrationFadeCalibrationMetrics;
  executable: CalibrationFadeExecutableMetrics;
}): {
  classification: CalibrationFadeCrossRunClassification;
  recommendedNextAction: CalibrationFadeCrossRunRecommendedNextAction;
  rationale: string;
} {
  const minimumMarkets = input.spec.minimumEvidenceRequirements.minimumIndependentCandidateMarkets;
  const minimumSettlementShare = input.spec.minimumEvidenceRequirements.minimumSettlementCoverageShare;

  if (!input.provenanceAvailable) {
    return result(
      "hypothesis-provenance-unavailable",
      "repair-historical-hypothesis-provenance",
      "Canonical historical hypothesis provenance could not be verified from source artifacts.",
    );
  }

  if (input.runSetIncompatible) {
    return result(
      "run-set-incompatible",
      "repair-run-set-hypothesis-identity",
      "One or more selected runs were analyzed under a mismatched hypothesis identity or configuration hash.",
    );
  }

  // Malformed candidate rows fail closed before any support/reject classification.
  if ((input.candidateParsingErrorCount ?? 0) > 0) {
    return result(
      "observation-quality-inconclusive",
      "repair-or-replace-invalid-forward-runs",
      `${input.candidateParsingErrorCount} malformed candidate market rows were detected; support/reject classification is blocked until inputs are repaired.`,
    );
  }

  // Observation quality precedes evidence quantity: an unverified, gappy, or
  // otherwise degraded run must not be classified as merely lacking events.
  const invalidRun = input.perRunSummaries.find((run) => {
    const qualityWeak =
      (run.runDurationSeconds !== null && run.runDurationSeconds <= 0)
      || run.recordsScanned < 0;
    return !isSelectedRunResearchReady(run) || qualityWeak;
  });
  if (invalidRun) {
    const healthFailure = describeSelectedRunHealthFailure(invalidRun);
    return result(
      "observation-quality-inconclusive",
      "repair-or-replace-invalid-forward-runs",
      `Selected run ${invalidRun.selectedRunId} failed required research-ready quality or identity checks${
        healthFailure ? `: ${healthFailure}` : "."
      }`,
    );
  }

  if (input.uniqueCandidateMarketCount < minimumMarkets) {
    return result(
      "insufficient-forward-events",
      "collect-additional-clean-forward-captures",
      `Only ${input.uniqueCandidateMarketCount} unique independent candidate markets; minimum is ${minimumMarkets}.`,
    );
  }

  if (
    input.settlementCoverage.settlementCoverageShare !== null
    && input.settlementCoverage.settlementCoverageShare < minimumSettlementShare
  ) {
    return result(
      "settlement-coverage-incomplete",
      "backfill-missing-candidate-settlements",
      "Unique-candidate settlement coverage is below the frozen minimum evidence threshold.",
    );
  }

  const signedGap = input.calibration.marketLevelSignedCalibrationGap;
  const rejectionGap = input.spec.minimumEvidenceRequirements.materialRejectionCalibrationGap;
  if (
    signedGap !== null
    && input.spec.calibrationDirection === "over"
    && signedGap <= -rejectionGap
  ) {
    return result(
      "cross-run-rejects-hypothesis",
      "deprioritize-calibration-fade-family",
      "Pooled market-level calibration gap is materially opposite the frozen historical direction.",
    );
  }

  const supportGap = input.spec.minimumEvidenceRequirements.materialSupportCalibrationGap;
  const calibrationSupported =
    signedGap !== null
    && ((input.spec.calibrationDirection === "over" && signedGap >= supportGap)
      || (input.spec.calibrationDirection === "under" && signedGap <= -supportGap));

  const executableEvidence = classifyExecutableEvidence({
    evaluatedExecutableCandidateCount: input.executable.evaluatedExecutableCandidateCount,
    feeAdjustedReturnCents: input.executable.feeAdjustedReturnCents,
    materialExecutableNetReturnCents:
      input.spec.minimumEvidenceRequirements.materialExecutableNetReturnCents,
  });

  if (calibrationSupported && executableEvidence === "supportive") {
    return result(
      "cross-run-supports-executable-fade",
      "build-paper-execution-harness",
      "Both pooled calibration and fee-adjusted executable hold-to-settlement results support the frozen direction.",
    );
  }

  if (calibrationSupported && executableEvidence === "contradictory") {
    return result(
      "cross-run-contradicts-executability",
      "retain-calibration-research-but-deprioritize-trading-rule",
      "Pooled calibration is supportive but evaluated executable pricing contradicts trading.",
    );
  }

  if (calibrationSupported) {
    return result(
      "cross-run-supports-calibration-effect",
      "build-executable-calibration-fade-candidate-dataset",
      "Pooled calibration gap supports the frozen historical direction at unique-market level; executable evidence is unavailable or insufficient and requires executable follow-up.",
    );
  }

  return result(
    "cross-run-inconclusive",
    "continue-frozen-forward-validation",
    "Accumulated forward evidence remains too limited or uncertain for a stronger classification.",
  );
}

function result(
  classification: CalibrationFadeCrossRunClassification,
  recommendedNextAction: CalibrationFadeCrossRunRecommendedNextAction,
  rationale: string,
) {
  return { classification, recommendedNextAction, rationale };
}
