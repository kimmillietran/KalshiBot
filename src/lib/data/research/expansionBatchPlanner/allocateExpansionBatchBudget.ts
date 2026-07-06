import type {
  ExpansionBatchAllocation,
  ScoredExpansionBatchMonthCandidate,
} from "./expansionBatchPlannerTypes";

function buildRiskNotes(candidate: ScoredExpansionBatchMonthCandidate): string[] {
  const notes: string[] = [];

  if (candidate.expectedImportability === "low" || candidate.estimatedUnsupportedRate >= 0.4) {
    notes.push(
      `Unsupported-heavy window: estimated unsupported rate ${Math.round(candidate.estimatedUnsupportedRate * 100)}%.`,
    );
  }

  if (candidate.discoveryAvailableCount === null) {
    notes.push("Discovery cache unavailable; month-level market availability is estimated only.");
  } else if (
    candidate.discoveryAvailableCount < candidate.desiredObservations - candidate.currentMarketCount
  ) {
    notes.push(
      `Discovery cache lists only ${candidate.discoveryAvailableCount} market(s) for this month.`,
    );
  }

  if (candidate.coverageStatus === "COVERED" && candidate.thinHypothesisCount > 0) {
    notes.push(
      "Month meets market-count thresholds but remains thin for promising hypothesis validation.",
    );
  }

  if (candidate.targetHypothesisIds.length === 0) {
    notes.push("No explicit hypothesis linkage; allocation driven by coverage gaps only.");
  }

  return notes;
}

function buildRationale(
  candidate: ScoredExpansionBatchMonthCandidate,
  marketCount: number,
): string {
  const parts: string[] = [
    `Allocate ${marketCount} market(s) to ${candidate.month}.`,
    candidate.scoreRationale,
  ];

  if (candidate.thinHypothesisCount > 0) {
    parts.push(
      `${candidate.thinHypothesisCount} promising hypothesis(es) have thin evidence in this month.`,
    );
  }

  if (candidate.recommendationPriority > 0) {
    parts.push(`Coverage-plan recommendation priority ${candidate.recommendationPriority.toFixed(1)}.`);
  }

  return parts.join(" ");
}

function capByDiscovery(
  candidate: ScoredExpansionBatchMonthCandidate,
  marketCount: number,
): number {
  if (candidate.discoveryAvailableCount === null) {
    return marketCount;
  }

  return Math.min(marketCount, candidate.discoveryAvailableCount);
}

/** Allocates the market budget across scored month candidates deterministically. */
export function allocateExpansionBatchBudget(input: {
  maxMarkets: number;
  candidates: readonly ScoredExpansionBatchMonthCandidate[];
}): ExpansionBatchAllocation[] {
  const { maxMarkets, candidates } = input;

  if (maxMarkets <= 0) {
    return [];
  }

  if (candidates.length === 0) {
    return [];
  }

  const eligible = candidates.filter((candidate) => candidate.score > 0);
  const pool = eligible.length > 0 ? eligible : [...candidates];

  const totalScore = pool.reduce((sum, candidate) => sum + candidate.score, 0);
  const rawShares = pool.map((candidate) => ({
    candidate,
    exact: totalScore === 0
      ? maxMarkets / pool.length
      : (candidate.score / totalScore) * maxMarkets,
  }));

  const floored = rawShares.map((entry) => ({
    candidate: entry.candidate,
    allocated: Math.floor(entry.exact),
    remainder: entry.exact - Math.floor(entry.exact),
  }));

  let assigned = floored.reduce((sum, entry) => sum + entry.allocated, 0);
  const byRemainder = [...floored].sort((left, right) => {
    const remainderCompare = right.remainder - left.remainder;
    if (remainderCompare !== 0) {
      return remainderCompare;
    }

    return left.candidate.month.localeCompare(right.candidate.month);
  });

  for (const entry of byRemainder) {
    if (assigned >= maxMarkets) {
      break;
    }

    entry.allocated += 1;
    assigned += 1;
  }

  const allocations: ExpansionBatchAllocation[] = [];
  for (const [index, entry] of floored.entries()) {
    if (entry.allocated <= 0) {
      continue;
    }

    const cappedCount = capByDiscovery(entry.candidate, entry.allocated);
    if (cappedCount <= 0) {
      continue;
    }

    allocations.push({
      allocationId: `batch-${entry.candidate.month}-${index + 1}`,
      month: entry.candidate.month,
      seriesTicker: entry.candidate.seriesTicker,
      marketCount: cappedCount,
      rationale: buildRationale(entry.candidate, cappedCount),
      targetHypothesisIds: entry.candidate.targetHypothesisIds,
      expectedValidationBenefit: entry.candidate.expectedValidationBenefit,
      expectedImportability: entry.candidate.expectedImportability,
      estimatedUnsupportedRate: entry.candidate.estimatedUnsupportedRate,
      currentObservations: entry.candidate.currentObservations,
      currentMarketCount: entry.candidate.currentMarketCount,
      desiredObservations: entry.candidate.desiredObservations,
      discoveryAvailableCount: entry.candidate.discoveryAvailableCount,
      riskNotes: buildRiskNotes(entry.candidate),
      priorityScore: entry.candidate.score,
    });
  }

  let totalAllocated = allocations.reduce((sum, entry) => sum + entry.marketCount, 0);
  if (totalAllocated === maxMarkets) {
    return allocations.sort((left, right) => right.marketCount - left.marketCount
      || left.month.localeCompare(right.month));
  }

  const redistributionPool = [...pool].sort((left, right) => {
    const scoreCompare = right.score - left.score;
    if (scoreCompare !== 0) {
      return scoreCompare;
    }

    return left.month.localeCompare(right.month);
  });

  while (totalAllocated < maxMarkets) {
    let progressed = false;

    for (const candidate of redistributionPool) {
      const allocation = allocations.find((entry) => entry.month === candidate.month);
      const currentCount = allocation?.marketCount ?? 0;
      const nextCount = capByDiscovery(candidate, currentCount + 1);

      if (nextCount <= currentCount) {
        continue;
      }

      if (allocation) {
        allocation.marketCount = nextCount;
        allocation.rationale = buildRationale(candidate, nextCount);
      } else {
        allocations.push({
          allocationId: `batch-${candidate.month}-extra`,
          month: candidate.month,
          seriesTicker: candidate.seriesTicker,
          marketCount: nextCount,
          rationale: buildRationale(candidate, nextCount),
          targetHypothesisIds: candidate.targetHypothesisIds,
          expectedValidationBenefit: candidate.expectedValidationBenefit,
          expectedImportability: candidate.expectedImportability,
          estimatedUnsupportedRate: candidate.estimatedUnsupportedRate,
          currentObservations: candidate.currentObservations,
          currentMarketCount: candidate.currentMarketCount,
          desiredObservations: candidate.desiredObservations,
          discoveryAvailableCount: candidate.discoveryAvailableCount,
          riskNotes: buildRiskNotes(candidate),
          priorityScore: candidate.score,
        });
      }

      totalAllocated += 1;
      progressed = true;

      if (totalAllocated >= maxMarkets) {
        break;
      }
    }

    if (!progressed) {
      break;
    }
  }

  return allocations.sort((left, right) => right.marketCount - left.marketCount
    || left.month.localeCompare(right.month));
}

/** Returns true when every allocation sums exactly to maxMarkets. */
export function expansionBatchAllocationTotal(
  allocations: readonly ExpansionBatchAllocation[],
): number {
  return allocations.reduce((sum, entry) => sum + entry.marketCount, 0);
}
