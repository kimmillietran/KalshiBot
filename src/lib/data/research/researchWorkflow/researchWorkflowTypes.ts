import { DEFAULT_HYPOTHESIS_FAILURE_ANALYSIS_OUTPUT_PATH } from "@/lib/data/research/hypothesisFailureAnalysis/hypothesisFailureAnalysisTypes";
import { DEFAULT_DERIVED_SETTLEMENT_SENSITIVITY_OUTPUT_PATH } from "@/lib/data/research/derivedSettlementSensitivity/derivedSettlementSensitivityTypes";
import { DEFAULT_HYPOTHESIS_REFINEMENTS_OUTPUT_PATH } from "@/lib/data/research/hypothesisRefinementGenerator/hypothesisRefinementTypes";
import { DEFAULT_STRATEGY_SYNTHESIS_DEBUG_OUTPUT_PATH } from "@/lib/data/research/strategySynthesisDebug/strategySynthesisDebugTypes";
import { DEFAULT_STRATEGY_HARNESS_SUMMARY_PATH } from "@/lib/data/research/harnessResults/harnessResultsTypes";

export const RESEARCH_WORKFLOW_FILENAME = "research-workflow.json";
export const DEFAULT_RESEARCH_WORKFLOW_OUTPUT_PATH =
  "data/research-results/research-workflow.json";
export const DEFAULT_RESEARCH_WORKFLOW_HTML_PATH =
  "data/reports/research-workflow.html";

export const REFINEMENT_HYPOTHESIS_CANDIDATES_FILENAME =
  "refinement-hypothesis-candidates.json";
export const DEFAULT_REFINEMENT_HYPOTHESIS_CANDIDATES_OUTPUT_PATH =
  "data/research-results/refinement-hypothesis-candidates.json";

export const MONTH_REGIME_ANALYSIS_FILENAME = "month-regime-analysis.json";
export const DEFAULT_MONTH_REGIME_ANALYSIS_OUTPUT_PATH =
  "data/research-results/month-regime-analysis.json";

export const RESEARCH_WORKFLOW_QUEUE_ACTIONS = [
  "validate-refinement-candidates",
  "run-research-only-harness",
  "investigate-month-instability",
  "gather-additional-history",
  "deprioritize",
] as const;

export type ResearchWorkflowQueueAction =
  (typeof RESEARCH_WORKFLOW_QUEUE_ACTIONS)[number];

export type ResearchWorkflowHypothesisStatus =
  | "active"
  | "blocked"
  | "deprioritized"
  | "unknown";

export type ResearchWorkflowInputPaths = {
  hypothesisFailureAnalysisPath: string;
  derivedSettlementSensitivityPath: string;
  hypothesisRefinementsPath: string;
  refinementHypothesisCandidatesPath: string;
  strategySynthesisDebugPath: string;
  monthRegimeAnalysisPath: string;
  harnessSummaryPath: string;
};

export const DEFAULT_RESEARCH_WORKFLOW_INPUT_PATHS: ResearchWorkflowInputPaths = {
  hypothesisFailureAnalysisPath: DEFAULT_HYPOTHESIS_FAILURE_ANALYSIS_OUTPUT_PATH,
  derivedSettlementSensitivityPath: DEFAULT_DERIVED_SETTLEMENT_SENSITIVITY_OUTPUT_PATH,
  hypothesisRefinementsPath: DEFAULT_HYPOTHESIS_REFINEMENTS_OUTPUT_PATH,
  refinementHypothesisCandidatesPath: DEFAULT_REFINEMENT_HYPOTHESIS_CANDIDATES_OUTPUT_PATH,
  strategySynthesisDebugPath: DEFAULT_STRATEGY_SYNTHESIS_DEBUG_OUTPUT_PATH,
  monthRegimeAnalysisPath: DEFAULT_MONTH_REGIME_ANALYSIS_OUTPUT_PATH,
  harnessSummaryPath: DEFAULT_STRATEGY_HARNESS_SUMMARY_PATH,
};

export type ResearchWorkflowInputStatus = {
  hypothesisFailureAnalysisPresent: boolean;
  derivedSettlementSensitivityPresent: boolean;
  hypothesisRefinementsPresent: boolean;
  refinementHypothesisCandidatesPresent: boolean;
  strategySynthesisDebugPresent: boolean;
  monthRegimeAnalysisPresent: boolean;
  harnessSummaryPresent: boolean;
};

export type ResearchWorkflowValidationStage = {
  passes: boolean | null;
  robustnessScore: number | null;
  summary: string | null;
};

export type ResearchWorkflowFailureStage = {
  summary: string | null;
  categories: readonly string[];
  priorityCategory: string | null;
  recommendedNextAction: string | null;
};

export type ResearchWorkflowDerivedSensitivityStage = {
  recommendation: string | null;
  deltaRobustness: number | null;
  summary: string | null;
};

export type ResearchWorkflowHarnessStage = {
  funnelStage: string | null;
  harnessEligible: boolean | null;
  harnessEvaluated: boolean | null;
  summary: string | null;
};

export type ResearchWorkflowMonthRegimeStage = {
  unstable: boolean | null;
  summary: string | null;
};

export type ResearchWorkflowHypothesisPipeline = {
  hypothesisId: string;
  hypothesis: string;
  workflowStatus: ResearchWorkflowHypothesisStatus;
  priorityRank: number;
  validation: ResearchWorkflowValidationStage;
  failure: ResearchWorkflowFailureStage;
  derivedSensitivity: ResearchWorkflowDerivedSensitivityStage;
  refinementsAvailable: number;
  registeredChildren: number;
  harness: ResearchWorkflowHarnessStage;
  monthRegime: ResearchWorkflowMonthRegimeStage;
  recommendedNextAction: ResearchWorkflowQueueAction;
};

export type ResearchWorkflowQueueItem = {
  rank: number;
  action: ResearchWorkflowQueueAction;
  label: string;
  rationale: string;
  hypothesisIds: readonly string[];
};

export type ResearchWorkflowFunnel = {
  hypothesisCandidates: number;
  validatedHypotheses: number;
  nearPromisingHypotheses: number;
  refinementCandidates: number;
  registeredRefinementChildren: number;
  synthesisCandidates: number;
  harnessEligible: number;
  harnessEvaluated: number;
};

export type ResearchWorkflowSummary = {
  totalHypotheses: number;
  activeHypothesisCount: number;
  blockedHypothesisCount: number;
  deprioritizedHypothesisCount: number;
  artifactsAvailable: number;
  artifactsTotal: number;
  nextRecommendedMilestone: string | null;
  highestValueTask: string | null;
};

export type ResearchWorkflowReport = {
  generatedAt: string;
  outputPath: string;
  htmlOutputPath: string;
  inputPaths: ResearchWorkflowInputPaths;
  inputStatus: ResearchWorkflowInputStatus;
  summary: ResearchWorkflowSummary;
  funnel: ResearchWorkflowFunnel;
  queue: readonly ResearchWorkflowQueueItem[];
  pipelines: readonly ResearchWorkflowHypothesisPipeline[];
};

export type ResearchWorkflowIo = {
  readFile: (path: string) => string;
  fileExists: (path: string) => boolean;
};

export class ResearchWorkflowError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ResearchWorkflowError";
  }
}
