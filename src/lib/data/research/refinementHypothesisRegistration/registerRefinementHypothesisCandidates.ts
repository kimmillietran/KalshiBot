import type { HypothesisCandidate } from "@/lib/data/research/hypothesisCandidates/hypothesisCandidateTypes";
import type { HypothesisRefinementCandidate } from "@/lib/data/research/hypothesisRefinementGenerator/hypothesisRefinementTypes";
import { HYPOTHESIS_REFINEMENT_TYPES } from "@/lib/data/research/hypothesisRefinementGenerator/hypothesisRefinementTypes";

import type { RefinementHypothesisRegistrationMetadata } from "@/lib/data/research/hypothesisCandidates/hypothesisCandidateTypes";
import type { RefinementRegistrationSkippedEntry, RegisteredRefinementHypothesisCandidate } from "./refinementHypothesisRegistrationTypes";
import { REFINEMENT_CANDIDATE_STATUS } from "./refinementHypothesisRegistrationTypes";

const DEFAULT_REQUIRED_DATA = [
  "Kalshi implied probability (bid/ask midpoint)",
  "Settlement outcome",
  "Replay context for bucket dimensions (time remaining, moneyness, volatility)",
] as const;

function isValidRefinementType(value: string): value is RefinementHypothesisRegistrationMetadata["refinementType"] {
  return (HYPOTHESIS_REFINEMENT_TYPES as readonly string[]).includes(value);
}

function buildMarketCondition(refinement: HypothesisRefinementCandidate): string {
  const withoutSuffix = refinement.refinedHypothesis
    .replace(/\s*\(refined .+\)\.$/, "")
    .replace(/\s*\(exclude months where edge reverses: .+\)\.$/, "")
    .replace(/\s*\(limit to strongest months: .+\)\.$/, "")
    .replace(/\s*\(official settlement only; .+\)\.$/, "")
    .replace(/\s*\(derived-settlement aware; .+\)\.$/, "");

  return withoutSuffix.split("; test ")[0] ?? refinement.refinedHypothesis;
}

function buildProposedEntryCondition(
  refinement: HypothesisRefinementCandidate,
  parent: HypothesisCandidate | null,
): string {
  if (parent?.proposedEntryCondition) {
    return `${parent.proposedEntryCondition} Apply refinement filters: ${JSON.stringify(refinement.suggestedFilters)}.`;
  }

  return `Enter when replay observations match parent bucket and refinement filters ${JSON.stringify(refinement.suggestedFilters)}.`;
}

export function registerRefinementHypothesisCandidate(
  refinement: HypothesisRefinementCandidate,
  parent: HypothesisCandidate | null,
  options: { generatedFromFailureAnalysis: boolean },
): RegisteredRefinementHypothesisCandidate | null {
  if (!refinement.refinementId?.trim()) {
    return null;
  }

  if (!refinement.parentHypothesisId?.trim()) {
    return null;
  }

  if (!isValidRefinementType(refinement.refinementType)) {
    return null;
  }

  if (refinement.status !== "candidate-refinement") {
    return null;
  }

  const registration: RefinementHypothesisRegistrationMetadata = {
    parentHypothesisId: refinement.parentHypothesisId,
    refinementType: refinement.refinementType,
    generatedFromFailureAnalysis: options.generatedFromFailureAnalysis,
    suggestedFilters: refinement.suggestedFilters,
    generationReason: refinement.rationale,
    refinementRank: refinement.priorityRank,
    status: REFINEMENT_CANDIDATE_STATUS,
  };

  const warnings = [
    `Refinement candidate derived from parent ${refinement.parentHypothesisId}; does not replace the parent hypothesis.`,
    `Overfitting risk: ${refinement.overfittingRisk}.`,
    `Status: ${REFINEMENT_CANDIDATE_STATUS}.`,
    ...(parent ? [] : ["Parent hypothesis candidate was not found; defaults applied."]),
  ];

  return {
    candidateId: refinement.refinementId,
    sourceArtifact: "hypothesis-refinements.json",
    hypothesis: refinement.refinedHypothesis,
    rationale: `${refinement.rationale} Expected benefit: ${refinement.expectedBenefit} Expected risk: ${refinement.expectedRisk}.`,
    marketCondition: buildMarketCondition(refinement),
    suggestedStrategyFamily: parent?.suggestedStrategyFamily ?? "calibration-no-fade",
    requiredData: parent?.requiredData ?? DEFAULT_REQUIRED_DATA,
    proposedEntryCondition: buildProposedEntryCondition(refinement, parent),
    proposedExitSettlementAssumption:
      parent?.proposedExitSettlementAssumption
      ?? "Hold through settlement unless a research-only stop is defined; evaluate PnL at market resolution.",
    expectedFailureMode:
      parent?.expectedFailureMode
      ?? "Refinement may overfit to sub-buckets or calendar filters and fail out of sample.",
    killCriterion:
      parent?.killCriterion
      ?? "Stop pursuing if out-of-sample calibration error falls below 2.5% across the next validation batch.",
    confidence: "low",
    warnings,
    bucketMetadata: parent?.bucketMetadata ?? null,
    refinementRegistration: registration,
  };
}

export type RegisterRefinementHypothesisCandidatesResult = {
  candidates: RegisteredRefinementHypothesisCandidate[];
  skippedEntries: RefinementRegistrationSkippedEntry[];
  duplicateSuppressedCount: number;
  parentCandidatesResolved: number;
  parentCandidatesMissing: number;
};

export function registerRefinementHypothesisCandidates(
  refinements: readonly HypothesisRefinementCandidate[],
  parentCandidates: readonly HypothesisCandidate[],
  options: { generatedFromFailureAnalysis: boolean },
): RegisterRefinementHypothesisCandidatesResult {
  const parentById = new Map(
    parentCandidates.map((candidate) => [candidate.candidateId, candidate]),
  );
  const skippedEntries: RefinementRegistrationSkippedEntry[] = [];
  const seenCandidateIds = new Set<string>();
  const registered: RegisteredRefinementHypothesisCandidate[] = [];
  let duplicateSuppressedCount = 0;
  let parentCandidatesResolved = 0;
  let parentCandidatesMissing = 0;

  const sortedRefinements = [...refinements].sort((left, right) => {
    if (left.priorityRank !== right.priorityRank) {
      return left.priorityRank - right.priorityRank;
    }

    return left.refinementId.localeCompare(right.refinementId);
  });

  for (const refinement of sortedRefinements) {
    if (!refinement.refinementId?.trim() || !refinement.parentHypothesisId?.trim()) {
      skippedEntries.push({
        refinementId: refinement.refinementId ?? null,
        reason: "Missing refinementId or parentHypothesisId",
      });
      continue;
    }

    if (seenCandidateIds.has(refinement.refinementId)) {
      duplicateSuppressedCount += 1;
      continue;
    }

    const parent = parentById.get(refinement.parentHypothesisId) ?? null;
    if (parent) {
      parentCandidatesResolved += 1;
    } else {
      parentCandidatesMissing += 1;
    }

    const candidate = registerRefinementHypothesisCandidate(
      refinement,
      parent,
      options,
    );

    if (!candidate) {
      skippedEntries.push({
        refinementId: refinement.refinementId,
        reason: "Malformed refinement entry",
      });
      continue;
    }

    seenCandidateIds.add(candidate.candidateId);
    registered.push(candidate);
  }

  return {
    candidates: registered,
    skippedEntries,
    duplicateSuppressedCount,
    parentCandidatesResolved,
    parentCandidatesMissing,
  };
}
