import type {
  MomentumCandidateDefinition,
  MomentumValidationStatus,
} from "./momentumEvidenceContractTypes";
import { MomentumEvidenceContractError } from "./momentumEvidenceContractTypes";
import { rejectReversalDirectionMutation } from "./familyDefinitionBinding";
import { assertCandidateDefinitionImmutable } from "./shortlistPolicy";

export type MomentumValidationCandidateInput = {
  candidate: MomentumCandidateDefinition;
  trainDefinition: MomentumCandidateDefinition;
  onTrainShortlist: boolean;
  independentValidationEss: number;
  minEssForValidation: number;
  directionalConsistency: "continuation-consistent" | "not-continuation-consistent" | "undefined";
  executableObservabilityShare: number;
  minExecutableObservabilityShare: number;
  captureQualityValid: boolean;
  midpointOnly: boolean;
  evidenceInvalidReason: string | null;
};

export type MomentumValidationCandidateResult = {
  candidateId: string;
  status: MomentumValidationStatus;
  rationale: string[];
  candidate: MomentumCandidateDefinition;
};

export function buildMomentumValidationSemantics(): {
  purpose: string;
  statuses: readonly MomentumValidationStatus[];
  notDefinedAs: string;
  mayNotMutateAxes: true;
  requirements: readonly string[];
} {
  return {
    purpose:
      "Validation replicates/narrows the fixed TRAIN shortlist before untouched holdout. "
      + "It is not a p<0.05 gate alone.",
    statuses: [
      "validated",
      "validation-failed",
      "underpowered-for-validation",
      "insufficient-validation-incidence",
      "invalid-evidence",
    ],
    notDefinedAs: "p < 0.05 alone",
    mayNotMutateAxes: true,
    requirements: [
      "exact candidate identity (immutable vs TRAIN)",
      "continuation-only direction",
      "independent-unit evidence",
      "executable observability",
      "capture quality",
      "direction consistency (median signed gross executable > 0)",
      "minimum evidence from contract floors (not post-hoc)",
    ],
  };
}

export function evaluateMomentumValidationCandidate(
  input: MomentumValidationCandidateInput,
): MomentumValidationCandidateResult {
  rejectReversalDirectionMutation(input.candidate.direction);
  assertCandidateDefinitionImmutable({
    trainDefinition: input.trainDefinition,
    laterDefinition: input.candidate,
  });

  if (!input.onTrainShortlist) {
    throw new MomentumEvidenceContractError(
      `Candidate ${input.candidate.candidateId} was not on the TRAIN shortlist; `
        + "losing/non-shortlisted TRAIN cells cannot enter validation.",
    );
  }

  if (input.evidenceInvalidReason || !input.captureQualityValid) {
    return {
      candidateId: input.candidate.candidateId,
      status: "invalid-evidence",
      rationale: [
        input.evidenceInvalidReason
          ?? "Capture-quality failure invalidates validation evidence.",
      ],
      candidate: input.candidate,
    };
  }

  if (input.independentValidationEss <= 0) {
    return {
      candidateId: input.candidate.candidateId,
      status: "insufficient-validation-incidence",
      rationale: ["No independent validation market-day/cell observations."],
      candidate: input.candidate,
    };
  }

  if (input.independentValidationEss < input.minEssForValidation) {
    return {
      candidateId: input.candidate.candidateId,
      status: "underpowered-for-validation",
      rationale: [
        `Underpowered for validation (ESS=${input.independentValidationEss} < `
          + `min=${input.minEssForValidation}).`,
      ],
      candidate: input.candidate,
    };
  }

  if (input.midpointOnly) {
    return {
      candidateId: input.candidate.candidateId,
      status: "validation-failed",
      rationale: ["Midpoint-only evidence cannot authorize economic validation support."],
      candidate: input.candidate,
    };
  }

  if (input.executableObservabilityShare < input.minExecutableObservabilityShare) {
    return {
      candidateId: input.candidate.candidateId,
      status: "validation-failed",
      rationale: ["Executable observability below validation floor."],
      candidate: input.candidate,
    };
  }

  if (input.directionalConsistency !== "continuation-consistent") {
    return {
      candidateId: input.candidate.candidateId,
      status: "validation-failed",
      rationale: [`Directional consistency not established (${input.directionalConsistency}).`],
      candidate: input.candidate,
    };
  }

  return {
    candidateId: input.candidate.candidateId,
    status: "validated",
    rationale: [
      "Continuation-consistent replication with adequate ESS and executable observability.",
      "TRAIN magnitude was not required to reproduce.",
    ],
    candidate: input.candidate,
  };
}
