import type { MicrostructureCandidateDefinition } from "./microstructureEvidenceContractTypes";
import type { MicrostructureValidationCandidateResult } from "./validationSemantics";

export type MicrostructureLockedHoldoutCandidate = {
  candidate: MicrostructureCandidateDefinition;
  lockRationale: string[];
  survivorCount: number;
};

export type MicrostructureLockInputSurvivor = MicrostructureValidationCandidateResult & {
  independentEvidenceSupport: number;
  directionalReplicationShare: number;
  executableObservabilityShare: number;
  effectClearsMaterialFloor: boolean;
  structuralSimplicityRank: number;
};

export function buildMicrostructureLockPolicy(): {
  zeroSurvivors: string;
  oneSurvivor: string;
  manySurvivors: string;
  tieBreakOrder: readonly string[];
  notLargestEffectOnly: true;
  holdoutEvaluatesExactlyOne: true;
} {
  return {
    zeroSurvivors: "Valid outcome: stop lineage; no holdout candidate locked.",
    oneSurvivor: "Lock the single validated survivor.",
    manySurvivors: "Apply deterministic predeclared tie-break (not max validation effect).",
    tieBreakOrder: [
      "independent evidence support",
      "directional replication share",
      "executable observability",
      "effect robustness (clears material floor; abs magnitude only soft margin)",
      "simpler / broader structural definition",
      "candidate ID",
    ],
    notLargestEffectOnly: true,
    holdoutEvaluatesExactlyOne: true,
  };
}

/**
 * Predeclared tie-break: DOES NOT maximize observed validation effect.
 */
export function lockHoldoutCandidateFromValidationSurvivors(input: {
  survivors: readonly MicrostructureLockInputSurvivor[];
}): MicrostructureLockedHoldoutCandidate | null {
  if (input.survivors.length === 0) {
    return null;
  }

  const validated = input.survivors.filter((row) => row.status === "validated");
  if (validated.length === 0) {
    return null;
  }

  const sorted = [...validated].sort((a, b) => {
    if (b.independentEvidenceSupport !== a.independentEvidenceSupport) {
      return b.independentEvidenceSupport - a.independentEvidenceSupport;
    }
    if (b.directionalReplicationShare !== a.directionalReplicationShare) {
      return b.directionalReplicationShare - a.directionalReplicationShare;
    }
    if (b.executableObservabilityShare !== a.executableObservabilityShare) {
      return b.executableObservabilityShare - a.executableObservabilityShare;
    }
    if (Number(b.effectClearsMaterialFloor) !== Number(a.effectClearsMaterialFloor)) {
      return Number(b.effectClearsMaterialFloor) - Number(a.effectClearsMaterialFloor);
    }
    if (a.structuralSimplicityRank !== b.structuralSimplicityRank) {
      return a.structuralSimplicityRank - b.structuralSimplicityRank;
    }
    return a.candidate.candidateId.localeCompare(b.candidate.candidateId);
  });

  const winner = sorted[0]!;
  return {
    candidate: winner.candidate,
    survivorCount: validated.length,
    lockRationale: [
      validated.length === 1
        ? "Single validated survivor locked."
        : `Deterministic tie-break among ${validated.length} validated survivors `
          + "(not largest validation effect).",
      ...buildMicrostructureLockPolicy().tieBreakOrder.map((step, i) => `${i + 1}. ${step}`),
    ],
  };
}
