import type { HypothesisCandidate, RefinementHypothesisRegistrationMetadata } from "@/lib/data/research/hypothesisCandidates/hypothesisCandidateTypes";

export const REFINEMENT_HYPOTHESIS_CANDIDATES_FILENAME =
  "refinement-hypothesis-candidates.json";
export const DEFAULT_REFINEMENT_HYPOTHESIS_CANDIDATES_OUTPUT_PATH =
  "data/research-results/refinement-hypothesis-candidates.json";
export const DEFAULT_REFINEMENT_HYPOTHESIS_CANDIDATES_HTML_PATH =
  "data/reports/refinement-hypothesis-candidates.html";

export const DEFAULT_HYPOTHESIS_REFINEMENTS_INPUT_PATH =
  "data/research-results/hypothesis-refinements.json";

export const REFINEMENT_CANDIDATE_STATUS = "candidate-refinement" as const;

export type { RefinementHypothesisRegistrationMetadata };

export type RegisteredRefinementHypothesisCandidate = HypothesisCandidate & {
  refinementRegistration: RefinementHypothesisRegistrationMetadata;
};

export type RefinementRegistrationSkippedEntry = {
  refinementId: string | null;
  reason: string;
};

export type RefinementHypothesisCandidatesSummary = {
  registeredCount: number;
  skippedMalformedCount: number;
  duplicateSuppressedCount: number;
  parentCandidatesResolved: number;
  parentCandidatesMissing: number;
  skippedEntries: readonly RefinementRegistrationSkippedEntry[];
};

export type RefinementHypothesisCandidatesInputPaths = {
  hypothesisRefinementsPath: string;
  hypothesisCandidatesPath: string;
  hypothesisFailureAnalysisPath: string;
};

export type RefinementHypothesisCandidatesInputStatus = {
  hypothesisRefinementsPresent: boolean;
  hypothesisCandidatesPresent: boolean;
  hypothesisFailureAnalysisPresent: boolean;
};

export type RefinementHypothesisCandidatesReport = {
  generatedAt: string;
  outputPath: string;
  htmlOutputPath: string;
  inputPaths: RefinementHypothesisCandidatesInputPaths;
  inputStatus: RefinementHypothesisCandidatesInputStatus;
  disclaimer: string;
  config: {
    minSampleSize: number;
    minCalibrationError: number;
    minLeadLagCorrelation: number;
    minUniqueTradingDays: number;
  };
  inputs: Record<string, unknown>;
  candidates: readonly RegisteredRefinementHypothesisCandidate[];
  summary: RefinementHypothesisCandidatesSummary;
};

export type RefinementHypothesisRegistrationIo = {
  readFile: (path: string) => string;
  fileExists: (path: string) => boolean;
};

export class RefinementHypothesisRegistrationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RefinementHypothesisRegistrationError";
  }
}

export const REFINEMENT_HYPOTHESIS_REGISTRATION_DISCLAIMER =
  "Registered refinement hypotheses are candidate-refinement entries derived from failure analysis. They do not replace parent hypotheses and require a full validation pass before any promotion.";
