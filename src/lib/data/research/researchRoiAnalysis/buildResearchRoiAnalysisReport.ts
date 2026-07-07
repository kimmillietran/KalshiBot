import { stableStringify } from "@/lib/trading/config/hashConfig";

import { computeResearchRoiMetrics } from "./computeResearchRoiMetrics";
import type {
  BuildResearchRoiAnalysisReportInput,
  ResearchRoiAnalysisReport,
} from "./researchRoiAnalysisTypes";

const DISCLAIMER =
  "Read-only ROI diagnostic derived from existing research artifacts. Does not modify hypothesis generation, validation, imports, or replay.";

function buildEmptyInputReasons(
  input: BuildResearchRoiAnalysisReportInput,
): string[] {
  const reasons: string[] = [];

  if (!input.inputStatus.hypothesisCandidatesPresent) {
    reasons.push("hypothesis-candidates.json was not found; ROI metrics require candidate artifacts.");
  }

  if (!input.inputStatus.mispricingAtlasPresent) {
    reasons.push("mispricing-atlas.json was not found; bucket utilization and yield metrics are limited.");
  }

  if (!input.inputStatus.hypothesisValidationPresent) {
    reasons.push("hypothesis-validation.json was not found; validation efficiency metrics are unavailable.");
  }

  if (!input.inputStatus.hypothesisFailureAnalysisPresent) {
    reasons.push("hypothesis-failure-analysis.json was not found; near-promising rates are unavailable.");
  }

  if (!input.inputStatus.hypothesisRefinementsPresent) {
    reasons.push("hypothesis-refinements.json was not found; refinement improvement metrics are unavailable.");
  }

  return reasons;
}

/** Builds a read-only research ROI analysis report from upstream artifacts. */
export function buildResearchRoiAnalysisReport(
  input: BuildResearchRoiAnalysisReportInput,
): ResearchRoiAnalysisReport {
  const summary = computeResearchRoiMetrics({
    candidates: input.candidates,
    validations: input.validations,
    failureAnalyses: input.failureAnalyses,
    refinements: input.refinements,
    mispricingAtlas: input.mispricingAtlas,
    emptyInputReasons: buildEmptyInputReasons(input),
  });

  return {
    generatedAt: input.generatedAt,
    outputPath: input.outputPath,
    htmlOutputPath: input.htmlOutputPath,
    inputPaths: input.inputPaths,
    inputStatus: input.inputStatus,
    disclaimer: DISCLAIMER,
    summary,
  };
}

export function serializeResearchRoiAnalysisReport(
  report: ResearchRoiAnalysisReport,
): string {
  return stableStringify(report);
}
