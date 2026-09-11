import {
  EXPECTED_MOMENTUM_DISCOVERY_HYPOTHESIS_COUNT,
  MOMENTUM_DIRECTION,
  MOMENTUM_MAX_SHORTLIST_K,
  MomentumEvidenceContractError,
  type MomentumCandidateDefinition,
} from "./momentumEvidenceContractTypes";
import { rejectReversalDirectionMutation } from "./familyDefinitionBinding";

export type MomentumShortlistScoreInput = {
  candidate: MomentumCandidateDefinition;
  independentTrainIncidence: number;
  directionConsistentWithFamily: boolean;
  executableObservabilityShare: number;
  executableEffectAvailable: boolean;
  independentMarketsTouched: number;
  independentMarketDaysTouched: number;
  /** Lower = simpler (smaller W → smaller X → smaller H). */
  structuralSimplicityRank: number;
};

export type MomentumShortlistRankedCandidate = MomentumShortlistScoreInput & {
  shortlistEligible: boolean;
  rejectionReasons: string[];
  rankingKey: string;
};

export function buildMomentumShortlistPolicy(): {
  maxK: number;
  expectedDiscoveryHypothesisCount: number;
  rankingDimensions: readonly string[];
  structuralSimplicityOrder: readonly string[];
  forbiddenMutations: readonly string[];
  selectionIsNotLargestEffectOnly: true;
} {
  return {
    maxK: MOMENTUM_MAX_SHORTLIST_K,
    expectedDiscoveryHypothesisCount: EXPECTED_MOMENTUM_DISCOVERY_HYPOTHESIS_COUNT,
    rankingDimensions: [
      "sufficient independent TRAIN incidence",
      "fixed continuation direction consistency (median signed gross executable > 0)",
      "executable observability",
      "executable-effect availability",
      "robustness across independent markets/market-days",
      "structural simplicity (smaller W → smaller X → smaller H → candidateId)",
      "deterministic candidate ID tie-break",
    ],
    structuralSimplicityOrder: [
      "smaller lookbackWindowMs (W)",
      "smaller thresholdCents (X)",
      "smaller responseHorizonMs (H)",
      "candidateId",
    ],
    forbiddenMutations: [
      "reversal direction",
      "neighboring threshold expansion",
      "new lookback windows",
      "new horizons",
      "learned sign flip",
      "resurrecting losing cells after validation",
    ],
    selectionIsNotLargestEffectOnly: true,
  };
}

export function computeStructuralSimplicityRank(candidate: MomentumCandidateDefinition): number {
  // Predeclared: smaller W → smaller X → smaller H. Encode as sortable rank.
  return (
    candidate.lookbackWindowMs * 1_000_000
    + candidate.thresholdCents * 1_000
    + candidate.responseHorizonMs
  );
}

function eligibility(input: MomentumShortlistScoreInput): {
  eligible: boolean;
  reasons: string[];
} {
  const reasons: string[] = [];
  try {
    rejectReversalDirectionMutation(input.candidate.direction);
  } catch {
    reasons.push("Direction must remain continuation-only; reversal forbidden.");
  }
  if (input.candidate.direction !== MOMENTUM_DIRECTION) {
    reasons.push("Direction must remain continuation-only.");
  }
  if (!input.directionConsistentWithFamily) {
    reasons.push("Direction inconsistent with fixed continuation hypothesis.");
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
 */
export function rankAndShortlistTrainCandidates(input: {
  discoveryHypothesisCount: number;
  candidates: readonly MomentumShortlistScoreInput[];
  maxK?: number;
}): {
  shortlist: MomentumShortlistRankedCandidate[];
  rejected: MomentumShortlistRankedCandidate[];
  retainedLineageCount: number;
} {
  if (input.discoveryHypothesisCount !== EXPECTED_MOMENTUM_DISCOVERY_HYPOTHESIS_COUNT) {
    throw new MomentumEvidenceContractError(
      `Discovery lineage must retain ${EXPECTED_MOMENTUM_DISCOVERY_HYPOTHESIS_COUNT} hypotheses; `
        + `got ${input.discoveryHypothesisCount}.`,
    );
  }
  if (input.candidates.length !== EXPECTED_MOMENTUM_DISCOVERY_HYPOTHESIS_COUNT) {
    throw new MomentumEvidenceContractError(
      `All ${EXPECTED_MOMENTUM_DISCOVERY_HYPOTHESIS_COUNT} hypotheses must be retained in lineage; `
        + `got ${input.candidates.length} candidates.`,
    );
  }
  const maxK = input.maxK ?? MOMENTUM_MAX_SHORTLIST_K;
  if (maxK > MOMENTUM_MAX_SHORTLIST_K) {
    throw new MomentumEvidenceContractError(
      `Shortlist K cannot exceed ${MOMENTUM_MAX_SHORTLIST_K}.`,
    );
  }

  const ranked: MomentumShortlistRankedCandidate[] = input.candidates.map((candidate) => {
    const { eligible, reasons } = eligibility(candidate);
    const rankingKey = [
      String(candidate.independentTrainIncidence).padStart(8, "0"),
      String(candidate.independentMarketDaysTouched).padStart(8, "0"),
      String(candidate.independentMarketsTouched).padStart(8, "0"),
      String(Math.round(candidate.executableObservabilityShare * 1000)).padStart(8, "0"),
      String(1_000_000_000 - candidate.structuralSimplicityRank).padStart(12, "0"),
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

  return {
    shortlist,
    rejected,
    retainedLineageCount: ranked.length,
  };
}

export function assertCandidateDefinitionImmutable(input: {
  trainDefinition: MomentumCandidateDefinition;
  laterDefinition: MomentumCandidateDefinition;
}): void {
  const keys: (keyof MomentumCandidateDefinition)[] = [
    "candidateId",
    "hypothesisId",
    "lookbackWindowMs",
    "thresholdCents",
    "responseHorizonMs",
    "direction",
  ];
  for (const key of keys) {
    if (input.trainDefinition[key] !== input.laterDefinition[key]) {
      throw new MomentumEvidenceContractError(
        `Candidate definition mutated at ${key}; W/X/H/direction immutable after TRAIN.`,
      );
    }
  }
}

export function shortlistRankingIgnoresEffectMagnitude(): true {
  return true;
}
