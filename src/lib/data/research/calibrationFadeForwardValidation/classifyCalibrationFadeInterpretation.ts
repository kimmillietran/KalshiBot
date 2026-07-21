import { RESEARCH_READY_CAPTURE_VERDICT } from "@/lib/data/research/selectedRunCaptureHealth";

import type {
  CalibrationFadeCalibrationMetrics,
  CalibrationFadeExecutableMetrics,
  CalibrationFadeForwardValidationReport,
  CalibrationFadeInterpretationClassification,
  CalibrationFadeRecommendedNextAction,
  CalibrationFadeSelectedRunQuality,
  CalibrationFadeSettlementCoverage,
  FrozenHypothesisSpec,
  HistoricalHypothesisBenchmark,
} from "./calibrationFadeForwardValidationTypes";
import { roundMetric } from "./calibrationFadeForwardValidationUtils";

export type ExecutableEvidenceState =
  | "supportive"
  | "contradictory"
  | "unavailable-or-insufficient";

/**
 * Tri-state executable evidence. Zero evaluated executable candidates is not
 * negative evidence; it means executable evidence is unavailable or insufficient.
 */
export function classifyExecutableEvidence(input: {
  evaluatedExecutableCandidateCount: number;
  feeAdjustedReturnCents: number | null;
  materialExecutableNetReturnCents: number;
}): ExecutableEvidenceState {
  if (input.evaluatedExecutableCandidateCount <= 0 || input.feeAdjustedReturnCents === null) {
    return "unavailable-or-insufficient";
  }
  if (input.feeAdjustedReturnCents >= input.materialExecutableNetReturnCents) {
    return "supportive";
  }
  return "contradictory";
}

export function classifyCalibrationFadeInterpretation(input: {
  spec: FrozenHypothesisSpec;
  provenanceAvailable: boolean;
  featureIncompatible: boolean;
  candidateMarketCount: number;
  settlementCoverage: CalibrationFadeSettlementCoverage;
  selectedRunQuality: CalibrationFadeSelectedRunQuality;
  calibration: CalibrationFadeCalibrationMetrics;
  executable: CalibrationFadeExecutableMetrics;
}): {
  interpretationClassification: CalibrationFadeInterpretationClassification;
  recommendedNextAction: CalibrationFadeRecommendedNextAction;
  rationale: string;
} {
  const minimumMarkets = input.spec.minimumEvidenceRequirements.minimumIndependentCandidateMarkets;
  const minimumSettlementShare = input.spec.minimumEvidenceRequirements.minimumSettlementCoverageShare;

  if (!input.provenanceAvailable) {
    return action(
      "hypothesis-provenance-unavailable",
      "repair-historical-hypothesis-provenance",
      "Canonical historical hypothesis provenance could not be verified from source artifacts.",
    );
  }

  if (input.featureIncompatible) {
    return action(
      "forward-feature-incompatible",
      "build-causal-feature-equivalence-audit",
      "One or more frozen historical features could not be reconstructed causally from the forward run.",
    );
  }

  // Observation quality is classified before evidence quantity so a failed or
  // unverified run cannot masquerade as a clean run that merely lacks events.
  const captureVerdict = input.selectedRunQuality.captureVerdict;
  if (captureVerdict !== null && captureVerdict !== RESEARCH_READY_CAPTURE_VERDICT) {
    return action(
      "observation-quality-inconclusive",
      "repair-or-replace-invalid-forward-runs",
      `Selected run capture verdict is ${captureVerdict}; capture-research-ready is required before evidence-quantity classification.`,
    );
  }

  if (captureVerdict === null) {
    return action(
      "observation-quality-inconclusive",
      "repair-or-replace-invalid-forward-runs",
      "Selected run has no verified capture-research-ready health source; run the capture health audit before formal validation.",
    );
  }

  const qualityWeak =
    (input.selectedRunQuality.validBookShare !== null
      && input.selectedRunQuality.validBookShare
        < input.spec.minimumEvidenceRequirements.minimumValidBookShare)
    || (input.selectedRunQuality.btcJoinCoverageShare !== null
      && input.selectedRunQuality.btcJoinCoverageShare
        < input.spec.minimumEvidenceRequirements.minimumBtcJoinCoverageShare);

  if (qualityWeak) {
    return action(
      "observation-quality-inconclusive",
      "fix-forward-observation-integrity",
      "Selected-run quality metrics are below frozen minimums for reliable forward validation.",
    );
  }

  if (input.candidateMarketCount < minimumMarkets) {
    return action(
      "insufficient-forward-events",
      "collect-additional-clean-forward-captures",
      `Only ${input.candidateMarketCount} independent candidate markets; minimum is ${minimumMarkets}.`,
    );
  }

  if (
    input.settlementCoverage.settlementCoverageShare !== null
    && input.settlementCoverage.settlementCoverageShare < minimumSettlementShare
  ) {
    return action(
      "settlement-coverage-incomplete",
      "backfill-and-rejoin-settlements",
      "Candidate settlement coverage is below the frozen minimum evidence threshold.",
    );
  }

  const signedGap = input.calibration.marketLevelSignedCalibrationGap;
  const rejectionGap = input.spec.minimumEvidenceRequirements.materialRejectionCalibrationGap;
  if (
    signedGap !== null
    && input.spec.calibrationDirection === "over"
    && signedGap <= -rejectionGap
  ) {
    return action(
      "forward-rejects-hypothesis",
      "deprioritize-calibration-fade-family",
      "Forward market-level calibration gap is materially opposite the frozen historical direction.",
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
    return action(
      "forward-supports-executable-fade",
      "build-paper-execution-harness",
      "Both calibration and fee-adjusted executable hold-to-settlement results support the frozen direction.",
    );
  }

  if (calibrationSupported && executableEvidence === "contradictory") {
    return action(
      "forward-contradicts-executability",
      "retain-calibration-research-but-deprioritize-trading-rule",
      "Calibration effect is directionally supportive but evaluated executable pricing contradicts trading.",
    );
  }

  if (calibrationSupported) {
    return action(
      "forward-supports-calibration-effect",
      "build-executable-calibration-fade-candidate-dataset",
      "Forward calibration gap supports the frozen historical direction at market level; executable evidence is unavailable or insufficient and requires executable follow-up.",
    );
  }

  return action(
    "forward-inconclusive",
    "continue-frozen-forward-validation",
    "Forward evidence remains too limited or uncertain for a stronger classification.",
  );
}

function action(
  interpretationClassification: CalibrationFadeInterpretationClassification,
  recommendedNextAction: CalibrationFadeRecommendedNextAction,
  rationale: string,
) {
  return { interpretationClassification, recommendedNextAction, rationale };
}

export function buildHistoricalVersusForwardComparison(input: {
  historical: HistoricalHypothesisBenchmark;
  forward: CalibrationFadeCalibrationMetrics;
}): Record<string, number | string | boolean | null> {
  return {
    historicalObservationCount: input.historical.discoveryObservationCount,
    historicalUniqueTradingDays: input.historical.discoveryUniqueTradingDays,
    historicalSignedCalibrationGap: input.historical.discoveryCalibrationError,
    historicalRobustnessScore: input.historical.discoveryRobustnessScore,
    forwardCandidateMarketCount: input.forward.candidateMarketCount,
    forwardSignedCalibrationGap: input.forward.marketLevelSignedCalibrationGap,
    effectDirectionMatches:
      input.historical.discoveryCalibrationError !== null
      && input.forward.marketLevelSignedCalibrationGap !== null
        ? Math.sign(input.historical.discoveryCalibrationError)
          === Math.sign(input.forward.marketLevelSignedCalibrationGap)
        : null,
    effectMagnitudeDelta:
      input.historical.discoveryCalibrationError !== null
      && input.forward.marketLevelSignedCalibrationGap !== null
        ? roundMetric(
            input.forward.marketLevelSignedCalibrationGap - input.historical.discoveryCalibrationError,
          )
        : null,
  };
}

export type BuildReportSummaryInput = Pick<
  CalibrationFadeForwardValidationReport,
  "summary" | "historicalBenchmark" | "forwardBenchmark"
>;
