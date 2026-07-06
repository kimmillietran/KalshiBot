import { estimateRecommendationImportability } from "@/lib/data/research/coveragePlanner/importability/estimateRecommendationImportability";
import type { ParsedExpansionImportMarketRecord } from "@/lib/data/research/coveragePlanner/importability/importabilityTypes";

import type {
  ExpansionBatchCandidateImportability,
  ExpansionBatchMonthCandidate,
  ExpansionBatchRejectedCandidate,
  ExpansionBatchRejectionReason,
  ScoredExpansionBatchMonthCandidate,
} from "./expansionBatchPlannerTypes";

function importabilityEstimateForCandidate(
  candidate: ExpansionBatchMonthCandidate,
  importabilityMarkets: readonly ParsedExpansionImportMarketRecord[],
) {
  return estimateRecommendationImportability(importabilityMarkets, {
    seriesTicker: candidate.seriesTicker,
    startMonth: candidate.month,
    endMonth: candidate.month,
  });
}

/** Estimates how many markets in a month bucket are likely importable. */
export function estimateExpansionBatchCandidateImportability(
  candidate: ExpansionBatchMonthCandidate,
  importabilityMarkets: readonly ParsedExpansionImportMarketRecord[],
): ExpansionBatchCandidateImportability {
  const importability = importabilityEstimateForCandidate(candidate, importabilityMarkets);
  const uncoveredDiscoveryCount =
    candidate.discoveryAvailableCount === null
      ? null
      : Math.max(0, candidate.discoveryAvailableCount - candidate.currentMarketCount);

  const hasSupportedImportEstimate =
    importability.successfulImports > 0
    || (
      importability.attemptedCount === 0
      && candidate.expectedImportability !== "low"
    );

  if (candidate.estimatedUnsupportedRate >= 1) {
    return {
      estimatedImportableMarketCount: 0,
      uncoveredDiscoveryCount,
      hasSupportedImportEstimate,
    };
  }

  if (uncoveredDiscoveryCount === 0) {
    return {
      estimatedImportableMarketCount: 0,
      uncoveredDiscoveryCount,
      hasSupportedImportEstimate,
    };
  }

  if (
    candidate.expectedImportability === "low"
    && importability.attemptedCount > 0
    && importability.successfulImports === 0
  ) {
    return {
      estimatedImportableMarketCount: 0,
      uncoveredDiscoveryCount,
      hasSupportedImportEstimate,
    };
  }

  if (
    importability.attemptedCount > 0
    && importability.successfulImports === 0
    && uncoveredDiscoveryCount !== null
    && uncoveredDiscoveryCount <= 1
  ) {
    return {
      estimatedImportableMarketCount: 0,
      uncoveredDiscoveryCount,
      hasSupportedImportEstimate,
    };
  }

  const baseCount =
    uncoveredDiscoveryCount
    ?? Math.max(0, candidate.desiredObservations - candidate.currentMarketCount);

  const estimatedImportableMarketCount = Math.max(
    0,
    Math.floor(baseCount * (1 - candidate.estimatedUnsupportedRate)),
  );

  return {
    estimatedImportableMarketCount,
    uncoveredDiscoveryCount,
    hasSupportedImportEstimate,
  };
}

function rejectionRationale(
  reason: ExpansionBatchRejectionReason,
  candidate: ScoredExpansionBatchMonthCandidate,
  importability: ExpansionBatchCandidateImportability,
): string {
  switch (reason) {
    case "unsupported-heavy":
      return `Month ${candidate.month} is unsupported-heavy (estimated unsupported rate ${Math.round(candidate.estimatedUnsupportedRate * 100)}%).`;
    case "zero-priority":
      return `Month ${candidate.month} has non-positive planner priority (${candidate.score.toFixed(1)}).`;
    case "already-covered":
      return importability.uncoveredDiscoveryCount === 0
        ? `Month ${candidate.month} has no uncovered discovered markets (${candidate.currentMarketCount}/${candidate.discoveryAvailableCount ?? "?" } already covered).`
        : `Month ${candidate.month} has zero estimated importable markets after coverage and importability signals.`;
    case "low-importability":
      return `Month ${candidate.month} is low-importability with no supported import estimate.`;
  }
}

/** Classifies why a scored month candidate cannot be scheduled for import. */
export function classifyExpansionBatchCandidateRejection(
  candidate: ScoredExpansionBatchMonthCandidate,
  importability: ExpansionBatchCandidateImportability,
): ExpansionBatchRejectionReason | null {
  if (candidate.estimatedUnsupportedRate >= 1) {
    return "unsupported-heavy";
  }

  if (candidate.score <= 0) {
    return "zero-priority";
  }

  if (importability.estimatedImportableMarketCount <= 0) {
    if (
      importability.uncoveredDiscoveryCount !== null
      && importability.uncoveredDiscoveryCount <= 1
      && candidate.discoveryAvailableCount !== null
    ) {
      return "already-covered";
    }

    if (importability.uncoveredDiscoveryCount === 0) {
      return "already-covered";
    }

    if (candidate.expectedImportability === "low" && !importability.hasSupportedImportEstimate) {
      return "low-importability";
    }

    return "low-importability";
  }

  if (candidate.expectedImportability === "low" && !importability.hasSupportedImportEstimate) {
    return "low-importability";
  }

  return null;
}

/** Splits scored candidates into importable and rejected month buckets. */
export function partitionImportableExpansionBatchCandidates(input: {
  candidates: readonly ScoredExpansionBatchMonthCandidate[];
  importabilityMarkets: readonly ParsedExpansionImportMarketRecord[];
}): {
  importableCandidates: ScoredExpansionBatchMonthCandidate[];
  rejectedCandidates: ExpansionBatchRejectedCandidate[];
  rejectedUnsupportedHeavyAllocationCount: number;
  rejectedZeroPriorityAllocationCount: number;
  rejectedAlreadyCoveredAllocationCount: number;
} {
  const importableCandidates: ScoredExpansionBatchMonthCandidate[] = [];
  const rejectedCandidates: ExpansionBatchRejectedCandidate[] = [];
  let rejectedUnsupportedHeavyAllocationCount = 0;
  let rejectedZeroPriorityAllocationCount = 0;
  let rejectedAlreadyCoveredAllocationCount = 0;

  for (const candidate of input.candidates) {
    const importability = estimateExpansionBatchCandidateImportability(
      candidate,
      input.importabilityMarkets,
    );
    const rejectionReason = classifyExpansionBatchCandidateRejection(
      candidate,
      importability,
    );

    if (!rejectionReason) {
      importableCandidates.push(candidate);
      continue;
    }

    if (rejectionReason === "unsupported-heavy") {
      rejectedUnsupportedHeavyAllocationCount += 1;
    } else if (rejectionReason === "zero-priority") {
      rejectedZeroPriorityAllocationCount += 1;
    } else if (rejectionReason === "already-covered") {
      rejectedAlreadyCoveredAllocationCount += 1;
    }

    rejectedCandidates.push({
      month: candidate.month,
      seriesTicker: candidate.seriesTicker,
      rejectionReason,
      priorityScore: candidate.score,
      expectedImportability: candidate.expectedImportability,
      estimatedUnsupportedRate: candidate.estimatedUnsupportedRate,
      estimatedImportableMarketCount: importability.estimatedImportableMarketCount,
      discoveryAvailableCount: candidate.discoveryAvailableCount,
      currentMarketCount: candidate.currentMarketCount,
      rationale: rejectionRationale(rejectionReason, candidate, importability),
    });
  }

  return {
    importableCandidates,
    rejectedCandidates,
    rejectedUnsupportedHeavyAllocationCount,
    rejectedZeroPriorityAllocationCount,
    rejectedAlreadyCoveredAllocationCount,
  };
}
