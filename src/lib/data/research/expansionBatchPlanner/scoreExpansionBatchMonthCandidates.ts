import type {
  ExpansionBatchMonthCandidate,
  ExpansionBatchPlanSelectionStrategy,
  ScoredExpansionBatchMonthCandidate,
} from "./expansionBatchPlannerTypes";

function coverageGapWeight(status: ExpansionBatchMonthCandidate["coverageStatus"]): number {
  switch (status) {
    case "MISSING":
      return 30;
    case "UNDER_COVERED":
      return 20;
    default:
      return 0;
  }
}

function supportLevelWeight(level: ExpansionBatchMonthCandidate["expectedImportability"]): number {
  switch (level) {
    case "high":
      return 40;
    case "medium":
      return 20;
    case "low":
      return 5;
  }
}

function unsupportedPenalty(rate: number, level: ExpansionBatchMonthCandidate["expectedImportability"]): number {
  const base = rate * 40;
  if (level === "low") {
    return base + 20;
  }

  return base;
}

function temporalNeed(candidate: ExpansionBatchMonthCandidate): number {
  const observationGap = Math.max(
    0,
    candidate.desiredObservations - candidate.currentObservations,
  );
  const marketGap = Math.max(
    0,
    candidate.desiredObservations - candidate.currentMarketCount,
  );

  return Math.max(observationGap, marketGap);
}

function deterministicShuffleKey(seed: string, month: string): number {
  let hash = 2166136261;
  const input = `${seed}:${month}`;

  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function scoreResearchValue(candidate: ExpansionBatchMonthCandidate): {
  score: number;
  scoreRationale: string;
} {
  const score =
    candidate.recommendationPriority
    + candidate.thinHypothesisCount * 8
    + candidate.coverageAwareBoost
    + coverageGapWeight(candidate.coverageStatus)
    - unsupportedPenalty(
      candidate.estimatedUnsupportedRate,
      candidate.expectedImportability,
    );

  return {
    score: Math.max(score, 0),
    scoreRationale:
      "Prioritizes recommendation priority, promising-hypothesis relevance, and coverage-aware validation benefit while penalizing unsupported-heavy windows.",
  };
}

function scoreTemporalBalance(candidate: ExpansionBatchMonthCandidate): {
  score: number;
  scoreRationale: string;
} {
  const score =
    temporalNeed(candidate) * 2
    + candidate.thinHypothesisCount * 10
    + coverageGapWeight(candidate.coverageStatus);

  return {
    score: Math.max(score, 0),
    scoreRationale:
      "Prioritizes months with the largest observation gap for promising hypotheses and under-covered calendar buckets.",
  };
}

function scoreSupportedFirst(candidate: ExpansionBatchMonthCandidate): {
  score: number;
  scoreRationale: string;
} {
  const score =
    supportLevelWeight(candidate.expectedImportability)
    - unsupportedPenalty(
      candidate.estimatedUnsupportedRate,
      candidate.expectedImportability,
    );

  return {
    score: Math.max(score, 0),
    scoreRationale:
      "Prioritizes months with historically strong importability and deprioritizes unsupported-heavy windows.",
  };
}

/** Scores month candidates for the requested selection strategy. */
export function scoreExpansionBatchMonthCandidates(
  candidates: readonly ExpansionBatchMonthCandidate[],
  strategy: ExpansionBatchPlanSelectionStrategy,
  selectionSeed: string,
): ScoredExpansionBatchMonthCandidate[] {
  if (strategy === "evenly-spaced") {
    return [...candidates]
      .sort((left, right) => left.month.localeCompare(right.month))
      .map((candidate) => ({
        ...candidate,
        score: 1,
        scoreRationale: "Even allocation across candidate months in chronological order.",
      }));
  }

  if (strategy === "random") {
    return [...candidates]
      .sort(
        (left, right) =>
          deterministicShuffleKey(selectionSeed, left.month)
          - deterministicShuffleKey(selectionSeed, right.month),
      )
      .map((candidate) => ({
        ...candidate,
        score: 1,
        scoreRationale: `Deterministic pseudo-random order seeded by ${selectionSeed}.`,
      }));
  }

  const scored = candidates.map((candidate) => {
    const result =
      strategy === "temporal-balance"
        ? scoreTemporalBalance(candidate)
        : strategy === "supported-first"
          ? scoreSupportedFirst(candidate)
          : scoreResearchValue(candidate);

    return {
      ...candidate,
      ...result,
    };
  });

  return scored.sort((left, right) => {
    const scoreCompare = right.score - left.score;
    if (scoreCompare !== 0) {
      return scoreCompare;
    }

    return left.month.localeCompare(right.month);
  });
}
