import { stableStringify } from "@/lib/trading/config/hashConfig";
import { DEFAULT_HYPOTHESIS_MIN_SAMPLE_SIZE } from "@/lib/data/research/hypothesisCandidates/hypothesisCandidateTypes";

import {
  analyzeDimensionInteractions,
  defaultAnalyzeConfig,
  rankDimensionInteractions,
} from "./analyzeDimensionInteractions";
import { mean, roundMetric } from "./computeInteractionMetrics";
import { loadDimensionInteractionAnalyticsInputs } from "./loadDimensionInteractionAnalyticsInputs";
import type {
  BuildDimensionInteractionAnalyticsReportInput,
  DimensionInteractionAnalysisReport,
  DimensionInteractionAnalysisSummary,
} from "./dimensionInteractionAnalyticsTypes";

function buildSummary(
  interactions: readonly DimensionInteractionAnalysisReport["interactions"][number][],
  emptyInputReasons: readonly string[],
): DimensionInteractionAnalysisSummary {
  return {
    compositeGroupCount: interactions.length,
    totalCandidates: interactions.reduce((sum, entry) => sum + entry.candidateCount, 0),
    totalValidated: interactions.reduce((sum, entry) => sum + entry.validatedCount, 0),
    averageInteractionScore: roundMetric(
      mean(interactions.map((entry) => entry.interactionScore)),
    ),
    emptyInputReasons,
  };
}

function buildInvestigatorNotes(
  report: Pick<DimensionInteractionAnalysisReport, "summary" | "inputStatus">,
): string[] {
  const notes = [
    "Read-only interaction quality analytics — not SHAP and not feature importance.",
    "Scores composite axis groups from existing candidates, validation, atlas, and optional failure analysis.",
  ];

  if (!report.inputStatus.hypothesisValidationPresent) {
    notes.push("hypothesis-validation.json missing; pass rate and robustness metrics will be zero.");
  }

  if (!report.inputStatus.hypothesisCandidatesPresent) {
    notes.push("hypothesis-candidates.json missing; candidate counts will be zero.");
  }

  if (!report.inputStatus.mispricingAtlasPresent) {
    notes.push("mispricing-atlas.json missing; sparsity, entropy, and coverage quality use defaults.");
  }

  if (!report.inputStatus.hypothesisFailureAnalysisPresent) {
    notes.push("hypothesis-failure-analysis.json missing; near-promising uses robustness heuristic.");
  }

  if (report.summary.emptyInputReasons.length > 0) {
    notes.push(...report.summary.emptyInputReasons);
  }

  return notes;
}

/** Builds the dimension interaction analytics report. */
export function buildDimensionInteractionAnalyticsReport(
  input: BuildDimensionInteractionAnalyticsReportInput,
): DimensionInteractionAnalysisReport {
  const defaults = defaultAnalyzeConfig();
  const passScoreThreshold = input.passScoreThreshold ?? defaults.passScoreThreshold;
  const minSampleThreshold = input.minSampleThreshold ?? DEFAULT_HYPOTHESIS_MIN_SAMPLE_SIZE;
  const nearPromisingRobustnessFloor =
    input.nearPromisingRobustnessFloor ?? defaults.nearPromisingRobustnessFloor;

  const loaded = loadDimensionInteractionAnalyticsInputs(input.io, input.inputPaths);
  const emptyInputReasons: string[] = [];

  if (!loaded.inputStatus.hypothesisCandidatesPresent) {
    emptyInputReasons.push("Missing hypothesis-candidates.json");
  }

  if (!loaded.inputStatus.hypothesisValidationPresent) {
    emptyInputReasons.push("Missing hypothesis-validation.json");
  }

  const interactions = analyzeDimensionInteractions({
    candidates: loaded.candidatesReport?.candidates ?? [],
    validations: loaded.validations,
    atlas: loaded.atlas,
    priorityByHypothesisId: loaded.priorityByHypothesisId,
    passScoreThreshold: loaded.passScoreThreshold ?? passScoreThreshold,
    minSampleThreshold,
    nearPromisingRobustnessFloor,
  });

  const rankings = rankDimensionInteractions(interactions);
  const summary = buildSummary(interactions, emptyInputReasons);

  const report: DimensionInteractionAnalysisReport = {
    generatedAt: input.generatedAt,
    outputPath: input.outputPath,
    htmlOutputPath: input.htmlOutputPath,
    inputPaths: input.inputPaths,
    inputStatus: loaded.inputStatus,
    config: {
      passScoreThreshold: loaded.passScoreThreshold ?? passScoreThreshold,
      minSampleThreshold,
      nearPromisingRobustnessFloor,
    },
    summary,
    interactions,
    rankings,
    investigatorNotes: [],
  };

  report.investigatorNotes = buildInvestigatorNotes(report);
  return report;
}

/** Serializes the interaction analytics report as deterministic JSON. */
export function serializeDimensionInteractionAnalyticsReport(
  report: DimensionInteractionAnalysisReport,
): string {
  return stableStringify(report);
}
