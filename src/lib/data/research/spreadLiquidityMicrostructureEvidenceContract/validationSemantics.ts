import type {
  MicrostructureCandidateDefinition,
  MicrostructureValidationStatus,
} from "./microstructureEvidenceContractTypes";
import { MicrostructureEvidenceContractError } from "./microstructureEvidenceContractTypes";
import { assertCandidateDefinitionImmutable, assertDirectionCannotFlip } from "./shortlistPolicy";

export type MicrostructureValidationCandidateInput = {
  candidate: MicrostructureCandidateDefinition;
  trainDefinition: MicrostructureCandidateDefinition;
  onTrainShortlist: boolean;
  independentValidationEss: number;
  minEssForValidation: number;
  directionalConsistency: "same-sign" | "opposite-sign" | "zero-or-undefined";
  executableObservabilityShare: number;
  minExecutableObservabilityShare: number;
  captureQualityValid: boolean;
  midpointOnly: boolean;
  evidenceInvalidReason: string | null;
};

export type MicrostructureValidationCandidateResult = {
  candidateId: string;
  status: MicrostructureValidationStatus;
  rationale: string[];
  candidate: MicrostructureCandidateDefinition;
};

export function buildMicrostructureValidationSemantics(): {
  purpose: string;
  statuses: readonly MicrostructureValidationStatus[];
  notDefinedAs: string;
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
    requirements: [
      "exact candidate identity (immutable vs TRAIN)",
      "same fixed same-direction",
      "independent-unit evidence",
      "executable observability",
      "capture quality",
      "directional consistency",
      "minimum evidence from contract floors (not post-hoc)",
    ],
  };
}

export function evaluateMicrostructureValidationCandidate(
  input: MicrostructureValidationCandidateInput,
): MicrostructureValidationCandidateResult {
  assertDirectionCannotFlip(input.candidate.direction);
  assertCandidateDefinitionImmutable({
    trainDefinition: input.trainDefinition,
    laterDefinition: input.candidate,
  });

  if (!input.onTrainShortlist) {
    throw new MicrostructureEvidenceContractError(
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

  if (input.directionalConsistency === "opposite-sign") {
    return {
      candidateId: input.candidate.candidateId,
      status: "validation-failed",
      rationale: ["Validation effect sign opposes fixed family direction."],
      candidate: input.candidate,
    };
  }

  if (input.directionalConsistency !== "same-sign") {
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
      "Same-sign directional replication with adequate ESS and executable observability.",
      "TRAIN magnitude was not required to reproduce.",
    ],
    candidate: input.candidate,
  };
}
