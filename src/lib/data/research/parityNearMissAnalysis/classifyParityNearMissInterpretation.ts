import type {
  ParityNearMissAnalysisSummary,
  ParityNearMissInterpretationClassification,
  ParityNearMissSelectedRunQuality,
} from "./parityNearMissAnalysisTypes";
import type { createEmptyGateCounts } from "./evaluateParityObservationGates";

const NARROW_NEAR_MISS_CENTS = 1;

export function classifyParityNearMissInterpretation(input: {
  recordsScanned: number;
  recordsEligible: number;
  qualificationFunnel: {
    bufferPass: number;
    grossPass: number;
    persistentPass: number;
    sizedBidPairs: number;
  };
  gateCounts: ReturnType<typeof createEmptyGateCounts>;
  closestGrossNearMiss: number | null;
  closestBufferNearMiss: number | null;
  selectedRunQuality: ParityNearMissSelectedRunQuality;
}): ParityNearMissAnalysisSummary {
  if (input.recordsScanned === 0) {
    return {
      interpretationClassification: "insufficient-data",
      recommendedNextAction: "run-forward-capture-then-rebuild-near-miss-analysis",
      closestGrossNearMissCents: null,
      closestBufferNearMissCents: null,
      candidateCount: 0,
      grossNearMissCount: input.gateCounts.allRejectionsByGate["gross-parity-shortfall"],
      bufferNearMissCount: input.gateCounts.allRejectionsByGate["buffer-adjusted-shortfall"],
    };
  }

  const candidateCount = input.qualificationFunnel.bufferPass;
  const closestGrossNearMissCents = input.closestGrossNearMiss;
  const closestBufferNearMissCents = input.closestBufferNearMiss;
  const grossNearMissCount = input.gateCounts.allRejectionsByGate["gross-parity-shortfall"];
  const bufferNearMissCount = input.gateCounts.allRejectionsByGate["buffer-adjusted-shortfall"];

  const observationQualityWeak =
    (input.selectedRunQuality.validBookShare !== null && input.selectedRunQuality.validBookShare < 0.9)
    || (input.selectedRunQuality.bidSizeCoverageShare !== null
      && input.selectedRunQuality.bidSizeCoverageShare < 0.9);

  let interpretationClassification: ParityNearMissInterpretationClassification;
  let recommendedNextAction: string;

  if (candidateCount > 0) {
    interpretationClassification = "candidates-present";
    recommendedNextAction = "proceed-to-candidate-episode-evaluation";
  } else if (observationQualityWeak) {
    interpretationClassification = "observation-quality-inconclusive";
    recommendedNextAction = "investigate-observation-integrity";
  } else if (
    input.qualificationFunnel.grossPass > 0
    && input.qualificationFunnel.persistentPass === 0
    && grossNearMissCount === 0
    && bufferNearMissCount > 0
  ) {
    interpretationClassification = "persistence-gate-binding";
    recommendedNextAction = "continue-frozen-rule-capture";
  } else if (
    input.gateCounts.allRejectionsByGate["missing-executable-size"]
      > input.gateCounts.allRejectionsByGate["gross-parity-shortfall"]
    || input.gateCounts.allRejectionsByGate["stale-quote"]
      > input.gateCounts.allRejectionsByGate["buffer-adjusted-shortfall"]
  ) {
    interpretationClassification = "execution-gates-binding";
    recommendedNextAction = "investigate-execution-constraint";
  } else if (
    closestGrossNearMissCents !== null
    && closestGrossNearMissCents <= NARROW_NEAR_MISS_CENTS
  ) {
    interpretationClassification = "no-signal-with-narrow-near-misses";
    recommendedNextAction = "continue-frozen-rule-capture";
  } else {
    interpretationClassification = "no-signal-far-from-threshold";
    recommendedNextAction = "deprioritize-current-parity-family";
  }

  return {
    interpretationClassification,
    recommendedNextAction,
    closestGrossNearMissCents,
    closestBufferNearMissCents,
    candidateCount,
    grossNearMissCount,
    bufferNearMissCount,
  };
}
