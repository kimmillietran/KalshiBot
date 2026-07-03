import { DEFAULT_HYPOTHESIS_CANDIDATES_OUTPUT_PATH } from "@/lib/data/research/hypothesisCandidates/hypothesisCandidateTypes";
import { DEFAULT_HYPOTHESIS_EVIDENCE_HTML_PATH } from "@/lib/data/research/hypothesisEvidence/hypothesisEvidenceTypes";
import {
  DEFAULT_HYPOTHESIS_VALIDATION_OUTPUT_PATH,
} from "@/lib/data/research/hypothesisRobustness/hypothesisRobustnessTypes";

export const DEFAULT_HYPOTHESIS_LIFECYCLE_HTML_PATH =
  "data/reports/research-hypothesis-lifecycle.html";
export const DEFAULT_STRATEGY_SYNTHESIS_CANDIDATES_PATH =
  "data/research-results/strategy-synthesis-candidates.json";
export const DEFAULT_STRATEGY_HARNESS_SUMMARY_PATH =
  "data/research-results/harness/strategy-harness-summary.json";
export const DEFAULT_STRATEGY_HARNESS_OUTPUT_DIR =
  "data/research-results/harness";

export const HYPOTHESIS_LIFECYCLE_STAGE_ORDER = [
  "generated",
  "evidenceReport",
  "robustnessValidation",
  "strategySynthesized",
  "backtested",
  "promotionDecision",
] as const;

export type HypothesisLifecycleStageId =
  (typeof HYPOTHESIS_LIFECYCLE_STAGE_ORDER)[number];

export type HypothesisLifecycleStageStatus =
  | "completed"
  | "partial"
  | "missing"
  | "failed";

export type HypothesisPipelineStatus =
  | "generated"
  | "evidence_ready"
  | "validated"
  | "synthesized"
  | "backtested"
  | "promoted"
  | "rejected"
  | "stalled";

export type HypothesisValidationOutcome = "passed" | "failed" | "pending" | "skipped";

export type HypothesisPromotionDecision =
  | "promoted"
  | "rejected"
  | "candidate"
  | "experimental"
  | "pending";

export type HypothesisLifecycleStageState = {
  stageId: HypothesisLifecycleStageId;
  label: string;
  status: HypothesisLifecycleStageStatus;
  timestamp: string | null;
  detail: string | null;
};

export type HypothesisLifecycleTimestamps = {
  generatedAt: string | null;
  evidenceReportAt: string | null;
  validationAt: string | null;
  synthesisAt: string | null;
  backtestAt: string | null;
  promotionAt: string | null;
};

export type HypothesisLifecycleEntry = {
  hypothesisId: string;
  title: string;
  status: HypothesisPipelineStatus;
  robustnessScore: number | null;
  linkedStrategyId: string | null;
  validationOutcome: HypothesisValidationOutcome;
  promotionDecision: HypothesisPromotionDecision;
  timestamps: HypothesisLifecycleTimestamps;
  warnings: readonly string[];
  stages: readonly HypothesisLifecycleStageState[];
};

export type HypothesisLifecycleInputPaths = {
  hypothesisCandidatesPath: string;
  evidenceHtmlPath: string;
  hypothesisValidationPath: string;
  strategySynthesisPath: string;
  strategyHarnessSummaryPath: string;
  strategyHarnessOutputDir: string;
};

export type HypothesisLifecycleSummary = {
  totalHypotheses: number;
  promotedCount: number;
  rejectedCount: number;
  pendingCount: number;
  backtestedCount: number;
  missingValidationCount: number;
};

export type HypothesisLifecycleReport = {
  generatedAt: string;
  outputPath: string;
  inputPaths: HypothesisLifecycleInputPaths;
  summary: HypothesisLifecycleSummary;
  entries: readonly HypothesisLifecycleEntry[];
};

export type BuildHypothesisLifecycleReportInput = {
  generatedAt: string;
  outputPath: string;
  inputPaths: HypothesisLifecycleInputPaths;
  inputs: ParsedHypothesisLifecycleInputs;
};

export type ParsedHypothesisCandidate = {
  candidateId: string;
  hypothesis: string;
  confidence: "low" | "medium" | "high";
  warnings: readonly string[];
  suggestedStrategyFamily: string;
};

export type ParsedHypothesisCandidatesDocument = {
  generatedAt: string;
  candidates: readonly ParsedHypothesisCandidate[];
};

export type ParsedHypothesisValidation = {
  hypothesisId: string;
  hypothesis: string;
  robustnessScore: number;
  passes: boolean;
  reasons: readonly string[];
};

export type ParsedHypothesisValidationDocument = {
  generatedAt: string;
  validations: readonly ParsedHypothesisValidation[];
};

export type ParsedSynthesizedStrategy = {
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
  strategies: readonly ParsedSynthesizedStrategy[];
};

export type ParsedHarnessResult = {
  synthesizedStrategyId: string;
  hypothesisId: string;
  status: "success" | "failed" | "skipped";
  errorMessage: string | null;
};

export type ParsedStrategyHarnessSummary = {
  completedAt: string;
  results: readonly ParsedHarnessResult[];
};

export type ParsedHypothesisLifecycleInputs = {
  candidates: ParsedHypothesisCandidatesDocument | null;
  evidenceHtmlPresent: boolean;
  evidenceHtmlModifiedAt: string | null;
  validation: ParsedHypothesisValidationDocument | null;
  synthesis: ParsedStrategySynthesisDocument | null;
  harnessSummary: ParsedStrategyHarnessSummary | null;
  harnessOutputCountByHypothesisId: ReadonlyMap<string, number>;
};

export type HypothesisLifecycleIo = {
  readFile: (path: string) => string;
  fileExists: (path: string) => boolean;
  getLastModified: (path: string) => string | null;
  readdir: (path: string) => readonly string[];
  isDirectory: (path: string) => boolean;
};

export const DEFAULT_HYPOTHESIS_LIFECYCLE_INPUT_PATHS: HypothesisLifecycleInputPaths = {
  hypothesisCandidatesPath: DEFAULT_HYPOTHESIS_CANDIDATES_OUTPUT_PATH,
  evidenceHtmlPath: DEFAULT_HYPOTHESIS_EVIDENCE_HTML_PATH,
  hypothesisValidationPath: DEFAULT_HYPOTHESIS_VALIDATION_OUTPUT_PATH,
  strategySynthesisPath: DEFAULT_STRATEGY_SYNTHESIS_CANDIDATES_PATH,
  strategyHarnessSummaryPath: DEFAULT_STRATEGY_HARNESS_SUMMARY_PATH,
  strategyHarnessOutputDir: DEFAULT_STRATEGY_HARNESS_OUTPUT_DIR,
};

export class HypothesisLifecycleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HypothesisLifecycleError";
  }
}
