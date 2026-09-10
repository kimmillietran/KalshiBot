import {
  MicrostructureEvidenceContractError,
  type MicrostructureCandidateDefinition,
  type MicrostructureHoldoutVerdict,
} from "./microstructureEvidenceContractTypes";
import { assertCandidateDefinitionImmutable } from "./shortlistPolicy";
import type { MicrostructureLockedHoldoutCandidate } from "./lockAndTieBreak";

export type MicrostructureHoldoutEvaluationInput = {
  locked: MicrostructureLockedHoldoutCandidate | null;
  evaluatedCandidate: MicrostructureCandidateDefinition | null;
  independentEss: number;
  requiredEffectiveN: number;
  captureQualityValid: boolean;
  executableObservableShare: number;
  minExecutableObservableShare: number;
  pointEstimateFavorable: boolean | null;
  evidenceInvalidReason: string | null;
  materialEffectThresholdCents: number | null;
  observedAbsExecutableEffectCents: number | null;
};

export type MicrostructureHoldoutEvaluationResult = {
  verdict: MicrostructureHoldoutVerdict;
  rationale: string[];
  evaluatedCandidateId: string | null;
  pointEstimateFavorable: boolean | null;
};

export function buildMicrostructureHoldoutSemantics(): {
  evaluatesExactlyOneLockedCandidate: true;
  verdicts: readonly MicrostructureHoldoutVerdict[];
  underpoweredIsNotSupportOrReject: true;
  requirements: readonly string[];
} {
  return {
    evaluatesExactlyOneLockedCandidate: true,
    verdicts: [
      "support",
      "reject",
      "underpowered",
      "insufficient-incidence",
      "invalid-evidence",
    ],
    underpoweredIsNotSupportOrReject: true,
    requirements: [
      "exact locked candidate identity",
      "untouched holdout partition",
      "independent-unit ESS",
      "executable observability",
      "capture quality",
      "material-effect threshold explicitly bound",
      "power-derived requiredEffectiveN",
    ],
  };
}

export function evaluateMicrostructureHoldout(
  input: MicrostructureHoldoutEvaluationInput,
): MicrostructureHoldoutEvaluationResult {
  if (input.locked === null) {
    throw new MicrostructureEvidenceContractError(
      "Holdout requires a locked candidate; zero validation survivors is a valid stop "
        + "but must not enter holdout.",
    );
  }

  if (input.evaluatedCandidate === null) {
    throw new MicrostructureEvidenceContractError(
      "Holdout evaluates exactly one locked candidate; evaluatedCandidate is required.",
    );
  }

  assertCandidateDefinitionImmutable({
    trainDefinition: input.locked.candidate,
    laterDefinition: input.evaluatedCandidate,
  });

  if (input.evaluatedCandidate.candidateId !== input.locked.candidate.candidateId) {
    throw new MicrostructureEvidenceContractError(
      "Non-validated / non-locked candidate cannot enter holdout.",
    );
  }

  if (input.materialEffectThresholdCents === null) {
    throw new MicrostructureEvidenceContractError(
      "materialEffectThresholdCents missing: validation/holdout authorization fails closed.",
    );
  }

  if (input.evidenceInvalidReason || !input.captureQualityValid) {
    return {
      verdict: "invalid-evidence",
      rationale: [
        input.evidenceInvalidReason
          ?? "Capture-quality failure invalidates holdout evidence.",
      ],
      evaluatedCandidateId: input.evaluatedCandidate.candidateId,
      pointEstimateFavorable: input.pointEstimateFavorable,
    };
  }

  if (input.independentEss <= 0) {
    return {
      verdict: "insufficient-incidence",
      rationale: ["No independent holdout market-day/cell observations."],
      evaluatedCandidateId: input.evaluatedCandidate.candidateId,
      pointEstimateFavorable: input.pointEstimateFavorable,
    };
  }

  if (input.independentEss < input.requiredEffectiveN) {
    return {
      verdict: "underpowered",
      rationale: [
        `Holdout ESS=${input.independentEss} < requiredEffectiveN=${input.requiredEffectiveN}.`,
        "Point estimate may be favorable or unfavorable; statistical verdict remains underpowered "
          + "(not support/reject).",
      ],
      evaluatedCandidateId: input.evaluatedCandidate.candidateId,
      pointEstimateFavorable: input.pointEstimateFavorable,
    };
  }

  if (input.executableObservableShare < input.minExecutableObservableShare) {
    return {
      verdict: "invalid-evidence",
      rationale: ["Executable observability below holdout floor."],
      evaluatedCandidateId: input.evaluatedCandidate.candidateId,
      pointEstimateFavorable: input.pointEstimateFavorable,
    };
  }

  const absEffect = input.observedAbsExecutableEffectCents;
  if (absEffect === null) {
    return {
      verdict: "invalid-evidence",
      rationale: ["Executable effect unobservable; missing response is not 0 cents."],
      evaluatedCandidateId: input.evaluatedCandidate.candidateId,
      pointEstimateFavorable: input.pointEstimateFavorable,
    };
  }

  if (
    input.pointEstimateFavorable === true
    && absEffect >= input.materialEffectThresholdCents
  ) {
    return {
      verdict: "support",
      rationale: [
        "Locked candidate cleared power, material-effect floor, and directional executable support.",
      ],
      evaluatedCandidateId: input.evaluatedCandidate.candidateId,
      pointEstimateFavorable: true,
    };
  }

  return {
    verdict: "reject",
    rationale: [
      "Adequate powered holdout did not clear directional material executable support.",
    ],
    evaluatedCandidateId: input.evaluatedCandidate.candidateId,
    pointEstimateFavorable: input.pointEstimateFavorable,
  };
}
