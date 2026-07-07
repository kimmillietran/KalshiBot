import { stableStringify } from "@/lib/trading/config/hashConfig";
import {
  DEFAULT_HYPOTHESIS_MIN_SAMPLE_SIZE,
  DEFAULT_MIN_CALIBRATION_ERROR,
  DEFAULT_MIN_LEAD_LAG_CORRELATION,
  DEFAULT_MIN_UNIQUE_TRADING_DAYS,
} from "@/lib/data/research/hypothesisCandidates/hypothesisCandidateTypes";
import type { HypothesisRefinementCandidate } from "@/lib/data/research/hypothesisRefinementGenerator/hypothesisRefinementTypes";
import type { HypothesisCandidate } from "@/lib/data/research/hypothesisCandidates/hypothesisCandidateTypes";

import { registerRefinementHypothesisCandidates } from "./registerRefinementHypothesisCandidates";
import type {
  RefinementHypothesisCandidatesInputPaths,
  RefinementHypothesisCandidatesInputStatus,
  RefinementHypothesisCandidatesReport,
  RefinementHypothesisCandidatesSummary,
} from "./refinementHypothesisRegistrationTypes";
import { REFINEMENT_HYPOTHESIS_REGISTRATION_DISCLAIMER } from "./refinementHypothesisRegistrationTypes";

export type BuildRefinementHypothesisCandidatesReportInput = {
  generatedAt: string;
  outputPath: string;
  htmlOutputPath: string;
  inputPaths: RefinementHypothesisCandidatesInputPaths;
  inputStatus: RefinementHypothesisCandidatesInputStatus;
  refinements: readonly HypothesisRefinementCandidate[];
  parentCandidates: readonly HypothesisCandidate[];
  generatedFromFailureAnalysis: boolean;
};

/** Registers M9.42 refinements as hypothesis-validation-compatible candidates. */
export function buildRefinementHypothesisCandidatesReport(
  input: BuildRefinementHypothesisCandidatesReportInput,
): RefinementHypothesisCandidatesReport {
  const registration = registerRefinementHypothesisCandidates(
    input.refinements,
    input.parentCandidates,
    { generatedFromFailureAnalysis: input.generatedFromFailureAnalysis },
  );

  const summary: RefinementHypothesisCandidatesSummary = {
    registeredCount: registration.candidates.length,
    skippedMalformedCount: registration.skippedEntries.length,
    duplicateSuppressedCount: registration.duplicateSuppressedCount,
    parentCandidatesResolved: registration.parentCandidatesResolved,
    parentCandidatesMissing: registration.parentCandidatesMissing,
    skippedEntries: registration.skippedEntries,
  };

  return {
    generatedAt: input.generatedAt,
    outputPath: input.outputPath,
    htmlOutputPath: input.htmlOutputPath,
    inputPaths: input.inputPaths,
    inputStatus: input.inputStatus,
    disclaimer: REFINEMENT_HYPOTHESIS_REGISTRATION_DISCLAIMER,
    config: {
      minSampleSize: DEFAULT_HYPOTHESIS_MIN_SAMPLE_SIZE,
      minCalibrationError: DEFAULT_MIN_CALIBRATION_ERROR,
      minLeadLagCorrelation: DEFAULT_MIN_LEAD_LAG_CORRELATION,
      minUniqueTradingDays: DEFAULT_MIN_UNIQUE_TRADING_DAYS,
    },
    inputs: {
      hypothesisRefinementsPath: input.inputPaths.hypothesisRefinementsPath,
      hypothesisCandidatesPath: input.inputPaths.hypothesisCandidatesPath,
      hypothesisFailureAnalysisPath: input.inputPaths.hypothesisFailureAnalysisPath,
      hypothesisRefinementsPresent: input.inputStatus.hypothesisRefinementsPresent,
      hypothesisCandidatesPresent: input.inputStatus.hypothesisCandidatesPresent,
      hypothesisFailureAnalysisPresent: input.inputStatus.hypothesisFailureAnalysisPresent,
    },
    candidates: registration.candidates,
    summary,
  };
}

export function serializeRefinementHypothesisCandidatesReport(
  report: RefinementHypothesisCandidatesReport,
): string {
  return stableStringify(report);
}
