import {
  EXPECTED_MICROSTRUCTURE_DISCOVERY_HYPOTHESIS_COUNT,
  MICROSTRUCTURE_MAX_SHORTLIST_K,
  MicrostructureEvidenceContractError,
  type MicrostructureCandidateDefinition,
} from "./microstructureEvidenceContractTypes";

export type MicrostructureShortlistScoreInput = {
  candidate: MicrostructureCandidateDefinition;
  independentTrainIncidence: number;
  directionConsistentWithFamily: boolean;
  executableObservabilityShare: number;
  executableEffectAvailable: boolean;
  independentMarketsTouched: number;
  independentMarketDaysTouched: number;
  structuralSimplicityRank: number; // lower = simpler/broader
};

export type MicrostructureShortlistRankedCandidate = MicrostructureShortlistScoreInput & {
  shortlistEligible: boolean;
  rejectionReasons: string[];
  rankingKey: string;
};

export function buildMicrostructureShortlistPolicy(): {
  maxK: number;
  expectedDiscoveryHypothesisCount: number;
  rankingDimensions: readonly string[];
  forbiddenMutations: readonly string[];
  selectionIsNotLargestEffectOnly: true;
} {
  return {
    maxK: MICROSTRUCTURE_MAX_SHORTLIST_K,
    expectedDiscoveryHypothesisCount: EXPECTED_MICROSTRUCTURE_DISCOVERY_HYPOTHESIS_COUNT,
    rankingDimensions: [
      "sufficient independent TRAIN incidence",
      "direction consistent with fixed family hypothesis",
      "executable observability",
      "executable-effect availability",
      "robustness across independent markets/market-days",
      "simpler / broader structural definition",
      "deterministic candidate ID tie-break",
    ],
    forbiddenMutations: [
      "neighboring-bin expansion",
      "sign flipping",
      "new thresholds",
      "new horizons",
      "additional probability bins",
      "resurrecting losing cells after validation",
    ],
    selectionIsNotLargestEffectOnly: true,
  };
}

function eligibility(input: MicrostructureShortlistScoreInput): {
  eligible: boolean;
  reasons: string[];
} {
  const reasons: string[] = [];
  if (input.candidate.direction !== "same-direction") {
    reasons.push("Direction must remain fixed same-direction; flipping forbidden.");
  }
  if (!input.directionConsistentWithFamily) {
    reasons.push("Direction inconsistent with fixed family hypothesis.");
  }
  if (input.independentTrainIncidence <= 0) {
    reasons.push("Insufficient independent TRAIN incidence.");
  }
  if (input.executableObservabilityShare <= 0) {
    reasons.push("Executable observability required for shortlist eligibility.");
  }
  if (!input.executableEffectAvailable) {
    reasons.push("Executable-effect availability required.");
  }
  return { eligible: reasons.length === 0, reasons };
}

/**
 * Deterministic shortlist: not "largest observed effect wins".
 * Ranking prefers incidence → markets/days → observability → simplicity → candidateId.
 */
export function rankAndShortlistTrainCandidates(input: {
  discoveryHypothesisCount: number;
  candidates: readonly MicrostructureShortlistScoreInput[];
  maxK?: number;
}): {
  shortlist: MicrostructureShortlistRankedCandidate[];
  rejected: MicrostructureShortlistRankedCandidate[];
} {
  if (input.discoveryHypothesisCount !== EXPECTED_MICROSTRUCTURE_DISCOVERY_HYPOTHESIS_COUNT) {
    throw new MicrostructureEvidenceContractError(
      `Discovery lineage must retain ${EXPECTED_MICROSTRUCTURE_DISCOVERY_HYPOTHESIS_COUNT} hypotheses; `
        + `got ${input.discoveryHypothesisCount}.`,
    );
  }
  const maxK = input.maxK ?? MICROSTRUCTURE_MAX_SHORTLIST_K;
  if (maxK > MICROSTRUCTURE_MAX_SHORTLIST_K) {
    throw new MicrostructureEvidenceContractError(
      `Shortlist K cannot exceed ${MICROSTRUCTURE_MAX_SHORTLIST_K}.`,
    );
  }

  const ranked: MicrostructureShortlistRankedCandidate[] = input.candidates.map((candidate) => {
    const { eligible, reasons } = eligibility(candidate);
    const rankingKey = [
      String(candidate.independentTrainIncidence).padStart(8, "0"),
      String(candidate.independentMarketDaysTouched).padStart(8, "0"),
      String(candidate.independentMarketsTouched).padStart(8, "0"),
      String(Math.round(candidate.executableObservabilityShare * 1000)).padStart(8, "0"),
      String(9999 - candidate.structuralSimplicityRank).padStart(8, "0"),
      candidate.candidate.candidateId,
    ].join("|");
    return {
      ...candidate,
      shortlistEligible: eligible,
      rejectionReasons: reasons,
      rankingKey,
    };
  });

  const eligible = ranked
    .filter((row) => row.shortlistEligible)
    .sort((a, b) => b.rankingKey.localeCompare(a.rankingKey));

  const shortlist = eligible.slice(0, maxK);
  const shortlistIds = new Set(shortlist.map((row) => row.candidate.candidateId));
  const rejected = ranked.filter((row) => !shortlistIds.has(row.candidate.candidateId));

  return { shortlist, rejected };
}

export function assertCandidateDefinitionImmutable(input: {
  trainDefinition: MicrostructureCandidateDefinition;
  laterDefinition: MicrostructureCandidateDefinition;
}): void {
  const keys: (keyof MicrostructureCandidateDefinition)[] = [
    "candidateId",
    "hypothesisId",
    "imbalanceThreshold",
    "responseHorizonMs",
    "timeRemainingBin",
    "direction",
  ];
  for (const key of keys) {
    if (input.trainDefinition[key] !== input.laterDefinition[key]) {
      throw new MicrostructureEvidenceContractError(
        `Candidate definition mutated on ${key}: `
          + `${String(input.trainDefinition[key])} → ${String(input.laterDefinition[key])}`,
      );
    }
  }
}

export function assertDirectionCannotFlip(direction: string): void {
  if (direction !== "same-direction") {
    throw new MicrostructureEvidenceContractError(
      "Microstructure family direction is fixed same-direction; flipping is forbidden.",
    );
  }
}
