import { stableStringify } from "@/lib/trading/config/hashConfig";
import { DEFAULT_HYPOTHESIS_VALIDATION_PASS_SCORE } from "@/lib/data/research/hypothesisRobustness/hypothesisRobustnessTypes";

import {
  analyzeStrategySynthesisHypothesisTrace,
  buildStrategySynthesisFunnelCounts,
  deriveStrategySynthesisDiagnosis,
  resolveStrategySynthesisDebugConfig,
} from "./analyzeStrategySynthesisBridge";
import { loadStrategySynthesisDebugInputs } from "./loadStrategySynthesisDebugInputs";
import type {
  BuildStrategySynthesisDebugReportInput,
  StrategySynthesisDebugReport,
  StrategySynthesisDebugSummary,
  StrategySynthesisRejectionCategory,
} from "./strategySynthesisDebugTypes";

const DEFAULT_NEAR_PROMISING_SCORE_FLOOR = 45;

function emptyCategoryCounts(): Record<StrategySynthesisRejectionCategory, number> {
  return {
    "not-synthesized": 0,
    "empty-candidate-file": 0,
    "missing-validation": 0,
    "insufficient-validation-score": 0,
    "validation-failed": 0,
    "promotion-rejected": 0,
    "unsupported-strategy-family": 0,
    "missing-entry-threshold": 0,
    "unsupported-entry-exit-condition": 0,
    "harness-schema-mismatch": 0,
    "threshold-mismatch": 0,
    "harness-filter-excluded": 0,
  };
}

function buildInvestigatorNotes(
  report: Pick<
    StrategySynthesisDebugReport,
    "summary" | "inputStatus" | "traces"
  >,
): string[] {
  const notes = [
    "Read-only debug report: does not relax filters, create strategies, or modify validation logic.",
    `Pass score threshold reference: ${DEFAULT_HYPOTHESIS_VALIDATION_PASS_SCORE}.`,
  ];

  if (!report.inputStatus.hypothesisValidationPresent) {
    notes.push("hypothesis-validation.json was not found; synthesis promotion reasons may be incomplete.");
  }

  if (!report.inputStatus.strategySynthesisPresent) {
    notes.push("strategy-synthesis-candidates.json was not found; synthesis stage diagnostics are limited.");
  }

  if (!report.inputStatus.harnessSummaryPresent) {
    notes.push("strategy-harness-summary.json was not found; harness evaluation counts default to zero.");
  }

  if (report.summary.funnel.harnessEligible === 0 && report.summary.funnel.synthesisCandidates > 0) {
    notes.push(
      "Zero harness-eligible strategies usually means promotionStatus=rejected or harness bridge translation failed.",
    );
  }

  return notes;
}

/** Builds the strategy synthesis debug report from upstream research artifacts. */
export function buildStrategySynthesisDebugReport(
  input: BuildStrategySynthesisDebugReportInput,
): StrategySynthesisDebugReport {
  const nearPromisingScoreFloor =
    input.nearPromisingScoreFloor ?? DEFAULT_NEAR_PROMISING_SCORE_FLOOR;
  const loaded = loadStrategySynthesisDebugInputs(input.io, input.inputPaths);
  const synthesisConfig = resolveStrategySynthesisDebugConfig(
    loaded.synthesisReport?.summary?.config as { candidatePromotionScoreThreshold?: number } | undefined,
  );

  const candidateById = new Map(
    (loaded.candidatesReport?.candidates ?? []).map((candidate) => [
      candidate.candidateId,
      candidate,
    ]),
  );
  const validationById = new Map(
    (loaded.validationReport?.validations ?? []).map((validation) => [
      validation.hypothesisId,
      validation,
    ]),
  );
  const strategyByHypothesisId = new Map(
    (loaded.synthesisReport?.strategies ?? []).map((strategy) => [
      strategy.hypothesisId,
      strategy,
    ]),
  );

  const hypothesisIds = [...new Set([
    ...candidateById.keys(),
    ...validationById.keys(),
    ...strategyByHypothesisId.keys(),
  ])].sort();

  const traces = hypothesisIds.map((hypothesisId) =>
    analyzeStrategySynthesisHypothesisTrace({
      hypothesisId,
      candidate: candidateById.get(hypothesisId) ?? null,
      validation: validationById.get(hypothesisId) ?? null,
      rawStrategy: strategyByHypothesisId.get(hypothesisId) ?? null,
      synthesisConfig,
      harnessSummary: loaded.harnessSummary,
      nearPromisingScoreFloor,
    }),
  );

  const promotionCounts = {
    experimental: 0,
    candidate: 0,
    rejected: 0,
  };
  for (const trace of traces) {
    if (trace.promotionStatus) {
      promotionCounts[trace.promotionStatus] += 1;
    }
  }

  const rejectionCategoryCounts = emptyCategoryCounts();
  for (const trace of traces) {
    for (const category of trace.rejectionCategories) {
      rejectionCategoryCounts[category] += 1;
    }
  }

  if ((loaded.candidatesReport?.candidates.length ?? 0) === 0) {
    rejectionCategoryCounts["empty-candidate-file"] = 1;
  }

  const funnel = buildStrategySynthesisFunnelCounts({
    traces,
    harnessSummary: loaded.harnessSummary,
    hypothesisCandidateCount: loaded.candidatesReport?.candidates.length ?? 0,
    synthesisCandidateCount: loaded.synthesisReport?.strategies.length ?? 0,
  });

  const emptyCandidateFileReasons =
    loaded.candidatesReport?.summary.noCandidateReasons ?? [];
  const harnessWarnings = loaded.harnessWarnings;

  const diagnosis = deriveStrategySynthesisDiagnosis({
    funnel,
    traces,
    emptyCandidateFileReasons,
    harnessWarnings,
  });

  const summary: StrategySynthesisDebugSummary = {
    funnel,
    diagnosis: diagnosis.diagnosis,
    diagnosisRationale: diagnosis.diagnosisRationale,
    recommendedNextTask: diagnosis.recommendedNextTask,
    emptyCandidateFileReasons,
    harnessWarnings,
    rejectionCategoryCounts,
    promotionCounts,
    nearPromisingCount: traces.filter(
      (trace) =>
        trace.robustnessScore !== null
        && trace.robustnessScore >= nearPromisingScoreFloor
        && trace.validationPasses === false,
    ).length,
  };

  const report: StrategySynthesisDebugReport = {
    generatedAt: input.generatedAt,
    outputPath: input.outputPath,
    htmlOutputPath: input.htmlOutputPath,
    inputPaths: input.inputPaths,
    inputStatus: loaded.inputStatus,
    summary,
    traces,
    investigatorNotes: [],
  };

  const notes = [...buildInvestigatorNotes(report)];
  if (loaded.synthesisParseError) {
    notes.push(`strategy-synthesis-candidates.json parse error: ${loaded.synthesisParseError}`);
  }

  report.investigatorNotes = notes;
  return report;
}

export function serializeStrategySynthesisDebugReport(
  report: StrategySynthesisDebugReport,
): string {
  return stableStringify(report);
}
