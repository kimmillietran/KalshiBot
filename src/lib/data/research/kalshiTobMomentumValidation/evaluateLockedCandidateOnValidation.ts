import {
  assertNetEdgeClaimFailsClosedWhenFeeUnbound,
  auditMomentumFeeContract,
  classifyContinuationDirectionConsistency,
  evaluateMomentumValidationCandidate,
  midpointOnlyCannotAuthorizeEconomicSupport,
  rejectReversalDirectionMutation,
  type MomentumCandidateDefinition,
} from "../momentumEvidenceContract";
import {
  LOCK_MOMENTUM_VALIDATION_CANDIDATE_ID,
} from "../kalshiTobMomentumValidationCohort";

import {
  MOMENTUM_VALIDATION_MIN_EXECUTABLE_OBSERVABILITY_SHARE,
  MOMENTUM_VALIDATION_MIN_ESS,
  MomentumValidationError,
  type MomentumValidationCandidateEvaluation,
  type MomentumValidationOutcomeMetrics,
} from "./momentumValidationTypes";

/**
 * Evaluate the single locked TRAIN candidate on gated validation outcome metrics.
 */
export function evaluateLockedCandidateOnValidation(input: {
  lockedCandidate: MomentumCandidateDefinition;
  trainDefinition: MomentumCandidateDefinition;
  outcomeMetrics: MomentumValidationOutcomeMetrics;
  captureQualityValid?: boolean;
  evidenceInvalidReason?: string | null;
  minEssForValidation?: number;
  minExecutableObservabilityShare?: number;
  onTrainShortlist?: boolean;
}): MomentumValidationCandidateEvaluation {
  rejectReversalDirectionMutation(input.lockedCandidate.direction);

  if (input.lockedCandidate.candidateId !== LOCK_MOMENTUM_VALIDATION_CANDIDATE_ID) {
    throw new MomentumValidationError(
      `Wrong candidate rejected: expected ${LOCK_MOMENTUM_VALIDATION_CANDIDATE_ID}, `
        + `got ${input.lockedCandidate.candidateId}`,
    );
  }

  const fee = auditMomentumFeeContract();
  assertNetEdgeClaimFailsClosedWhenFeeUnbound({
    feeContractStatus: fee.feeContractStatus,
    claimingNetEdge: false,
  });

  const midpointGate = midpointOnlyCannotAuthorizeEconomicSupport({
    midpointContinuationCents: input.outcomeMetrics.signedMidpointMedianCents,
    executablePnlCents: input.outcomeMetrics.signedExecutableMedianCents,
    executableObservable:
      input.outcomeMetrics.executableObservabilityShare > 0
      && input.outcomeMetrics.signedExecutableMedianCents != null,
  });

  const midpointOnly =
    input.outcomeMetrics.midpointOnly
    || !midpointGate.economicSupportAuthorized;

  const directionalConsistency = classifyContinuationDirectionConsistency(
    input.outcomeMetrics.signedExecutableMedianCents,
  );

  const evaluated = evaluateMomentumValidationCandidate({
    candidate: input.lockedCandidate,
    trainDefinition: input.trainDefinition,
    onTrainShortlist: input.onTrainShortlist ?? true,
    independentValidationEss: input.outcomeMetrics.independentValidationEss,
    minEssForValidation: input.minEssForValidation ?? MOMENTUM_VALIDATION_MIN_ESS,
    directionalConsistency,
    executableObservabilityShare: input.outcomeMetrics.executableObservabilityShare,
    minExecutableObservabilityShare:
      input.minExecutableObservabilityShare
      ?? MOMENTUM_VALIDATION_MIN_EXECUTABLE_OBSERVABILITY_SHARE,
    captureQualityValid: input.captureQualityValid ?? true,
    midpointOnly,
    evidenceInvalidReason: input.evidenceInvalidReason ?? null,
  });

  return {
    candidateId: evaluated.candidateId,
    status: evaluated.status,
    rationale: evaluated.rationale,
    candidate: evaluated.candidate,
    directionalConsistency,
    outcomeMetrics: input.outcomeMetrics,
    feeContractStatus: fee.feeContractStatus,
    netEdgeClaimAuthorized: false,
  };
}
