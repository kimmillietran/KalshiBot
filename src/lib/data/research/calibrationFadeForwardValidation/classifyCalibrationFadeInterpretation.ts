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

  const executableSupported =
    input.executable.feeAdjustedReturnCents !== null
    && input.executable.feeAdjustedReturnCents
      >= input.spec.minimumEvidenceRequirements.materialExecutableNetReturnCents
    && input.executable.executableCandidateCount > 0;

  if (calibrationSupported && executableSupported) {
    return action(
      "forward-supports-executable-fade",
      "build-paper-execution-harness",
      "Both calibration and fee-adjusted executable hold-to-settlement results support the frozen direction.",
    );
  }

  if (calibrationSupported && !executableSupported) {
    return action(
      "forward-contradicts-executability",
      "retain-calibration-research-but-deprioritize-trading-rule",
      "Calibration effect is directionally supportive but executable pricing does not support trading.",
    );
  }

  if (calibrationSupported) {
    return action(
      "forward-supports-calibration-effect",
      "build-executable-calibration-fade-candidate-dataset",
      "Forward calibration gap supports the frozen historical direction at market level.",
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
