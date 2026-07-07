import { stableStringify } from "@/lib/trading/config/hashConfig";

import {
  countSkippedParents,
  generateHypothesisRefinements,
} from "./generateHypothesisRefinements";
import type {
  BuildHypothesisRefinementReportInput,
  HypothesisRefinementReport,
  HypothesisRefinementSummary,
  HypothesisRefinementType,
} from "./hypothesisRefinementTypes";
import {
  HYPOTHESIS_REFINEMENT_DISCLAIMER,
  HYPOTHESIS_REFINEMENT_TYPES,
} from "./hypothesisRefinementTypes";

function buildSummary(
  input: BuildHypothesisRefinementReportInput,
  refinements: ReturnType<typeof generateHypothesisRefinements>,
): HypothesisRefinementSummary {
  const refinementsByType = Object.fromEntries(
    HYPOTHESIS_REFINEMENT_TYPES.map((type) => [type, 0]),
  ) as Record<HypothesisRefinementType, number>;

  for (const refinement of refinements) {
    refinementsByType[refinement.refinementType] += 1;
  }

  const parentIds = new Set(refinements.map((entry) => entry.parentHypothesisId));
  const skipCounts = countSkippedParents(input.failureAnalyses);

  return {
    totalParentsConsidered: input.failureAnalyses.filter((entry) => !entry.passes).length,
    parentsWithRefinements: parentIds.size,
    totalRefinements: refinements.length,
    refinementsByType,
    nearPromisingParents: skipCounts.nearPromisingParents,
    skippedLikelySpurious: skipCounts.skippedLikelySpurious,
    skippedCoverageBlocked: skipCounts.skippedCoverageBlocked,
  };
}

/** Builds read-only refinement candidates from failure analysis and related artifacts. */
export function buildHypothesisRefinementReport(
  input: BuildHypothesisRefinementReportInput,
): HypothesisRefinementReport {
  const refinements = generateHypothesisRefinements({
    failureAnalyses: input.failureAnalyses,
    validations: input.validations,
    mispricingAtlas: input.mispricingAtlas,
    crossValidationEntries: input.crossValidationEntries,
  });

  return {
    generatedAt: input.generatedAt,
    outputPath: input.outputPath,
    htmlOutputPath: input.htmlOutputPath,
    inputPaths: input.inputPaths,
    inputStatus: input.inputStatus,
    disclaimer: HYPOTHESIS_REFINEMENT_DISCLAIMER,
    summary: buildSummary(input, refinements),
    refinements,
  };
}

export function serializeHypothesisRefinementReport(
  report: HypothesisRefinementReport,
): string {
  return stableStringify(report);
}
