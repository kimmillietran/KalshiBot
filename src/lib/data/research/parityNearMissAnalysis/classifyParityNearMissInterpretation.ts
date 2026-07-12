import type {
  ParityNearMissAnalysisSummary,
  ParityNearMissInterpretationClassification,
  ParityNearMissSelectedRunQuality,
  ParityNearMissSequentialQualificationFunnel,
} from "./parityNearMissAnalysisTypes";
import type { IndependentGatePassCounts } from "./parityGateSemantics";
import type { createEmptyGateCounts } from "./evaluateParityObservationGates";

export const NARROW_NEAR_MISS_CENTS = 1;

export function classifyParityNearMissInterpretation(input: {
  recordsScanned: number;
  recordsEligible: number;
  sequentialFunnel: ParityNearMissSequentialQualificationFunnel;
  independentGatePassCounts: IndependentGatePassCounts;
  gateCounts: ReturnType<typeof createEmptyGateCounts>;
  closestGrossNearMiss: number | null;
  closestFeeAdjustedNearMiss: number | null;
  closestBufferNearMiss: number | null;
  grossNearMissCount: number;
  feeAdjustedNearMissCount: number;
  bufferNearMissCount: number;
  selectedRunQuality: ParityNearMissSelectedRunQuality;
}): ParityNearMissAnalysisSummary {
  const candidateCount = input.sequentialFunnel.finalCandidate;
  const closestGrossNearMissCents = input.closestGrossNearMiss;
  const closestFeeAdjustedNearMissCents = input.closestFeeAdjustedNearMiss;
  const closestBufferNearMissCents = input.closestBufferNearMiss;
  const executionGateRejectionCount =
    input.gateCounts.allRejectionsByGate["unsynchronized-book"]
    + input.gateCounts.allRejectionsByGate["stale-quote"]
    + input.gateCounts.allRejectionsByGate["missing-executable-size"];

  if (input.recordsScanned === 0 || input.recordsEligible === 0) {
    return {
      interpretationClassification: "insufficient-data",
      recommendedNextAction: "run-forward-capture-then-rebuild-near-miss-analysis",
      classificationRationale: "No evaluable observations were loaded for the selected run.",
      closestGrossNearMissCents,
      closestFeeAdjustedNearMissCents,
      closestBufferNearMissCents,
      candidateCount: 0,
      grossNearMissCount: input.grossNearMissCount,
      feeAdjustedNearMissCount: input.feeAdjustedNearMissCount,
      bufferNearMissCount: input.bufferNearMissCount,
    };
  }

  const observationQualityWeak =
    (input.selectedRunQuality.validBookShare !== null
      && input.selectedRunQuality.validBookShare < 0.9)
    || (input.selectedRunQuality.bidSizeCoverageShare !== null
      && input.selectedRunQuality.bidSizeCoverageShare < 0.9)
    || (input.selectedRunQuality.btcJoinCoverageShare !== null
      && input.selectedRunQuality.btcJoinCoverageShare < 0.9);

  let interpretationClassification: ParityNearMissInterpretationClassification;
  let recommendedNextAction: string;
  let classificationRationale: string;

  if (candidateCount > 0) {
    interpretationClassification = "candidates-present";
    recommendedNextAction = "proceed-to-candidate-episode-evaluation";
    classificationRationale = "At least one observation reached the final candidate stage.";
  } else if (observationQualityWeak) {
    interpretationClassification = "observation-quality-inconclusive";
    recommendedNextAction = "fix-observation-integrity";
    classificationRationale =
      "Selected-run quality metrics indicate the capture may not support reliable parity diagnostics.";
  } else if (
    input.independentGatePassCounts.grossThresholdPass > input.sequentialFunnel.grossThreshold
    && input.sequentialFunnel.finalCandidate === 0
    && executionGateRejectionCount > 0
  ) {
    interpretationClassification = "execution-gates-binding";
    recommendedNextAction = "investigate-execution-constraint";
    classificationRationale =
      "Gross-qualified observations were eliminated by synchronization, staleness, or executable-size gates.";
  } else if (
    input.sequentialFunnel.grossThreshold > 0
    && input.sequentialFunnel.finalCandidate === 0
    && (
      input.sequentialFunnel.feeThreshold < input.sequentialFunnel.grossThreshold
      || input.sequentialFunnel.bufferThreshold < input.sequentialFunnel.feeThreshold
    )
  ) {
    interpretationClassification = "fees-or-buffer-binding";
    recommendedNextAction = "continue-frozen-rule-capture";
    classificationRationale =
      "Observations reached gross qualification but were eliminated by fee or buffer thresholds.";
  } else if (
    input.sequentialFunnel.bufferThreshold > 0
    && input.gateCounts.episodesReachingStage.persistentEpisode === 0
    && input.gateCounts.episodesReachingStage.bufferEpisode > 0
  ) {
    interpretationClassification = "persistence-gate-binding";
    recommendedNextAction = "continue-frozen-rule-capture";
    classificationRationale =
      "Buffer-qualified observations existed but no persistent candidate episodes were formed.";
  } else if (
    input.sequentialFunnel.grossThreshold === 0
    && closestGrossNearMissCents !== null
    && closestGrossNearMissCents <= NARROW_NEAR_MISS_CENTS
  ) {
    interpretationClassification = "no-signal-with-narrow-near-misses";
    recommendedNextAction = "continue-frozen-rule-capture";
    classificationRationale =
      `No positive gross edge was observed; closest gross shortfall is ${closestGrossNearMissCents} cents (<= ${NARROW_NEAR_MISS_CENTS}).`;
  } else if (input.sequentialFunnel.grossThreshold === 0) {
    interpretationClassification = "no-signal-far-from-threshold";
    recommendedNextAction = "deprioritize-current-parity-family";
    classificationRationale =
      closestGrossNearMissCents === null
        ? "No gross-qualified observations and no computable gross shortfalls."
        : `No positive gross edge; closest gross shortfall is ${closestGrossNearMissCents} cents (> ${NARROW_NEAR_MISS_CENTS}).`;
  } else {
    interpretationClassification = "no-signal-far-from-threshold";
    recommendedNextAction = "deprioritize-current-parity-family";
    classificationRationale = "No final candidates and gross signal did not dominate the binding gate pattern.";
  }

  return {
    interpretationClassification,
    recommendedNextAction,
    classificationRationale,
    closestGrossNearMissCents,
    closestFeeAdjustedNearMissCents,
    closestBufferNearMissCents,
    candidateCount,
    grossNearMissCount: input.grossNearMissCount,
    feeAdjustedNearMissCount: input.feeAdjustedNearMissCount,
    bufferNearMissCount: input.bufferNearMissCount,
  };
}
