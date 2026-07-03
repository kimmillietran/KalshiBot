import { DEFAULT_HYPOTHESIS_CANDIDATES_OUTPUT_PATH } from "@/lib/data/research/hypothesisCandidates/hypothesisCandidateTypes";
import { DEFAULT_HYPOTHESIS_VALIDATION_OUTPUT_PATH } from "@/lib/data/research/hypothesisRobustness/hypothesisRobustnessTypes";

export const RESEARCH_CANDIDATE_REGISTRY_FILENAME = "research-candidate-registry.json";
export const DEFAULT_RESEARCH_CANDIDATE_REGISTRY_OUTPUT_PATH =
  "data/research-results/research-candidate-registry.json";
export const DEFAULT_RESEARCH_CANDIDATE_REGISTRY_HTML_PATH =
  "data/reports/research-candidate-registry.html";
export const DEFAULT_STRATEGY_SYNTHESIS_CANDIDATES_PATH =
  "data/research-results/strategy-synthesis-candidates.json";
export const DEFAULT_HARNESS_RESULTS_PATH =
  "data/research-results/harness-results.json";
export const DEFAULT_HARNESS_SUMMARY_FALLBACK_PATH =
  "data/research-results/harness/strategy-harness-summary.json";

export const RESEARCH_CANDIDATE_STATUSES = [
  "hypothesis",
  "validated",
  "synthesized",
  "backtested",
  "candidate",
  "rejected",
] as const;

export type ResearchCandidateStatus = (typeof RESEARCH_CANDIDATE_STATUSES)[number];

export type ResearchCandidateHarnessMetrics = {
  evaluatedRuns: number;
  successfulRuns: number;
  failedRuns: number;
  skippedRuns: number;
  lastHarnessCompletedAt: string | null;
};

export type ResearchCandidatePromotionEvent = {
  timestamp: string;
  previousStatus: ResearchCandidateStatus | null;
  nextStatus: ResearchCandidateStatus;
  reason: string;
};

export type ResearchCandidateRegistryEntry = {
  candidateId: string;
  hypothesisId: string;
  strategyId: string | null;
  strategyFamily: string;
  creationTimestamp: string;
  validationScore: number | null;
  harnessMetrics: ResearchCandidateHarnessMetrics | null;
  currentStatus: ResearchCandidateStatus;
  rejectionReasons: readonly string[];
  promotionHistory: readonly ResearchCandidatePromotionEvent[];
};

export type ResearchCandidateRegistrySummary = {
  totalCandidates: number;
  hypothesisCount: number;
  validatedCount: number;
  synthesizedCount: number;
  backtestedCount: number;
  candidateCount: number;
  rejectedCount: number;
};

export type ResearchCandidateRegistryInputPaths = {
  hypothesisCandidatesPath: string;
  hypothesisValidationPath: string;
  strategySynthesisPath: string;
  harnessResultsPath: string;
  harnessSummaryFallbackPath: string;
  existingRegistryPath: string;
};

export const DEFAULT_RESEARCH_CANDIDATE_REGISTRY_INPUT_PATHS: ResearchCandidateRegistryInputPaths =
  {
    hypothesisCandidatesPath: DEFAULT_HYPOTHESIS_CANDIDATES_OUTPUT_PATH,
    hypothesisValidationPath: DEFAULT_HYPOTHESIS_VALIDATION_OUTPUT_PATH,
    strategySynthesisPath: DEFAULT_STRATEGY_SYNTHESIS_CANDIDATES_PATH,
    harnessResultsPath: DEFAULT_HARNESS_RESULTS_PATH,
    harnessSummaryFallbackPath: DEFAULT_HARNESS_SUMMARY_FALLBACK_PATH,
    existingRegistryPath: DEFAULT_RESEARCH_CANDIDATE_REGISTRY_OUTPUT_PATH,
  };

export type ResearchCandidateRegistryReport = {
  generatedAt: string;
  outputPath: string;
  htmlOutputPath: string;
  inputPaths: ResearchCandidateRegistryInputPaths;
  summary: ResearchCandidateRegistrySummary;
  candidates: readonly ResearchCandidateRegistryEntry[];
};

export type BuildResearchCandidateRegistryInput = {
  generatedAt: string;
  outputPath: string;
  htmlOutputPath: string;
  inputPaths: ResearchCandidateRegistryInputPaths;
  inputs: ParsedResearchCandidateRegistryInputs;
  existingRegistry: ResearchCandidateRegistryReport | null;
};

export type ParsedHypothesisCandidateRecord = {
  candidateId: string;
  suggestedStrategyFamily: string;
  warnings: readonly string[];
};

export type ParsedHypothesisCandidatesDocument = {
  generatedAt: string;
  candidates: readonly ParsedHypothesisCandidateRecord[];
};

export type ParsedHypothesisValidationRecord = {
  hypothesisId: string;
  robustnessScore: number;
  passes: boolean;
  reasons: readonly string[];
};

export type ParsedHypothesisValidationDocument = {
  generatedAt: string;
  validations: readonly ParsedHypothesisValidationRecord[];
};

export type ParsedSynthesizedStrategyRecord = {
  strategyId: string;
  hypothesisId: string;
  strategyFamily: string;
  promotionStatus: "experimental" | "candidate" | "rejected";
  validationSummary: {
    robustnessScore: number | null;
    passes: boolean;
  };
  riskNotes: readonly string[];
};

export type ParsedStrategySynthesisDocument = {
  generatedAt: string;
  strategies: readonly ParsedSynthesizedStrategyRecord[];
};

export type ParsedHarnessResultRecord = {
  synthesizedStrategyId: string;
  hypothesisId: string;
  status: "success" | "failed" | "skipped";
  errorMessage: string | null;
};

export type ParsedHarnessResultsDocument = {
  completedAt: string;
  results: readonly ParsedHarnessResultRecord[];
};

export type ParsedResearchCandidateRegistryInputs = {
  hypothesisCandidates: ParsedHypothesisCandidatesDocument | null;
  hypothesisValidation: ParsedHypothesisValidationDocument | null;
  strategySynthesis: ParsedStrategySynthesisDocument | null;
  harnessResults: ParsedHarnessResultsDocument | null;
};

export type ResearchCandidateRegistryIo = {
  readFile: (path: string) => string;
  fileExists: (path: string) => boolean;
};

export class ResearchCandidateRegistryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ResearchCandidateRegistryError";
  }
}
