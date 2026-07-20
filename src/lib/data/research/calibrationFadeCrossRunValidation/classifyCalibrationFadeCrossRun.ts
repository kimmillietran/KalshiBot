import type {
  CalibrationFadeCalibrationMetrics,
  CalibrationFadeExecutableMetrics,
  CalibrationFadeSettlementCoverage,
  FrozenHypothesisSpec,
} from "@/lib/data/research/calibrationFadeForwardValidation/calibrationFadeForwardValidationTypes";
import { RESEARCH_READY_CAPTURE_VERDICT } from "@/lib/data/research/selectedRunCaptureHealth";

import type {
  CalibrationFadeCrossRunClassification,
  CalibrationFadeCrossRunRecommendedNextAction,
  CrossRunRunSummary,
} from "./calibrationFadeCrossRunValidationTypes";

export function classifyCalibrationFadeCrossRun(input: {
  spec: FrozenHypothesisSpec;
  provenanceAvailable: boolean;
  runSetIncompatible: boolean;
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

  const invalidRun = input.perRunSummaries.find((run) => {
    const verdict = run.captureVerdict;
    const researchReady =
      verdict === RESEARCH_READY_CAPTURE_VERDICT || verdict === "capture-research-ready";
    const qualityWeak =
      (run.runDurationSeconds !== null && run.runDurationSeconds <= 0)
      || run.recordsScanned < 0;
    return !researchReady || qualityWeak;
  });
  if (invalidRun) {
    return result(
      "observation-quality-inconclusive",
      "repair-or-replace-invalid-forward-runs",
      `Selected run ${invalidRun.selectedRunId} failed required research-ready quality or identity checks.`,
    );
  }

  // Also check frozen quality thresholds against per-run quality when available via warnings path —
  // captureVerdict is the strict gate; below we still enforce candidate-count precedence.

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

  const executableSupported =
    input.executable.feeAdjustedReturnCents !== null
    && input.executable.feeAdjustedReturnCents
      >= input.spec.minimumEvidenceRequirements.materialExecutableNetReturnCents
    && input.executable.evaluatedExecutableCandidateCount > 0;

  if (calibrationSupported && executableSupported) {
    return result(
      "cross-run-supports-executable-fade",
      "build-paper-execution-harness",
      "Both pooled calibration and fee-adjusted executable hold-to-settlement results support the frozen direction.",
    );
  }

  if (calibrationSupported && !executableSupported) {
    return result(
      "cross-run-contradicts-executability",
      "retain-calibration-research-but-deprioritize-trading-rule",
      "Pooled calibration is supportive but executable pricing does not support trading.",
    );
  }

  if (calibrationSupported) {
    return result(
      "cross-run-supports-calibration-effect",
      "build-executable-calibration-fade-candidate-dataset",
      "Pooled calibration gap supports the frozen historical direction at unique-market level.",
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
