import { stableStringify } from "@/lib/trading/config/hashConfig";
import { DEFAULT_HYPOTHESIS_VALIDATION_PASS_SCORE } from "@/lib/data/research/hypothesisRobustness/hypothesisRobustnessTypes";

import {
  analyzeHypothesisFailure,
  rankHypothesisFailureAnalyses,
} from "./analyzeHypothesisFailure";
import type {
  BuildHypothesisFailureAnalysisReportInput,
  HypothesisFailureAnalysisEntry,
  HypothesisFailureAnalysisReport,
  HypothesisFailureAnalysisSummary,
  HypothesisRecommendedNextAction,
} from "./hypothesisFailureAnalysisTypes";

function buildSummary(
  analyses: readonly HypothesisFailureAnalysisEntry[],
): HypothesisFailureAnalysisSummary {
  const recommendedNextActions = {
    "collect-more-data": 0,
    "inspect-month-breakdown": 0,
    "inspect-derived-data-sensitivity": 0,
    "lower-priority": 0,
    "retire-if-next-batch-fails": 0,
    "strategy-synthesis-investigation": 0,
  } satisfies Record<HypothesisRecommendedNextAction, number>;

  for (const analysis of analyses) {
    recommendedNextActions[analysis.recommendedNextAction] += 1;
  }

  return {
    totalHypotheses: analyses.length,
    passingCount: analyses.filter((entry) => entry.passes).length,
    failingCount: analyses.filter((entry) => !entry.passes).length,
    nearPromisingCount: analyses.filter(
      (entry) => entry.priorityCategory === "near-promising",
    ).length,
    highestRobustnessScore: analyses.reduce(
      (max, entry) => Math.max(max, entry.robustnessScore),
      0,
    ),
    recommendedNextActions,
  };
}

/** Builds read-only hypothesis failure diagnostics from upstream research artifacts. */
export function buildHypothesisFailureAnalysisReport(
  input: BuildHypothesisFailureAnalysisReportInput,
): HypothesisFailureAnalysisReport {
  const passThreshold = input.passThreshold ?? DEFAULT_HYPOTHESIS_VALIDATION_PASS_SCORE;

  const candidateById = new Map(
    input.candidates.map((candidate) => [candidate.candidateId, candidate]),
  );
  const coverageById = new Map(
    input.coverageEntries.map((entry) => [entry.hypothesisId, entry]),
  );
  const crossValidationById = new Map(
    input.crossValidationEntries
      .filter((entry) => entry.targetType === "hypothesis")
      .map((entry) => [entry.hypothesisId, entry]),
  );

  const hypothesisIds = [...new Set([
    ...input.validations.map((validation) => validation.hypothesisId),
    ...input.candidates.map((candidate) => candidate.candidateId),
  ])].sort();

  const analyses = rankHypothesisFailureAnalyses(
    hypothesisIds.flatMap((hypothesisId) => {
      const validation = input.validations.find(
        (entry) => entry.hypothesisId === hypothesisId,
      );
      if (!validation) {
        return [];
      }

      return [
        analyzeHypothesisFailure({
          validation,
          candidate: candidateById.get(hypothesisId) ?? null,
          coverageEntry: coverageById.get(hypothesisId) ?? null,
          crossValidation: crossValidationById.get(hypothesisId) ?? null,
          hypothesisHistory: input.hypothesisHistory,
          passThreshold,
        }),
      ];
    }),
  );

  return {
    generatedAt: input.generatedAt,
    outputPath: input.outputPath,
    htmlOutputPath: input.htmlOutputPath,
    inputPaths: input.inputPaths,
    inputStatus: input.inputStatus,
    passThreshold,
    summary: buildSummary(analyses),
    analyses,
  };
}

export function serializeHypothesisFailureAnalysisReport(
  report: HypothesisFailureAnalysisReport,
): string {
  return stableStringify(report);
}
