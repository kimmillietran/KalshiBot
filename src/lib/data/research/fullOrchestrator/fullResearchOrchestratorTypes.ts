import type { ResearchPipelineRunner } from "@/lib/data/research/pipeline";

export const FULL_RESEARCH_SUMMARY_FILENAME = "full-research-summary.json";
export const DEFAULT_FULL_RESEARCH_SUMMARY_PATH =
  "data/research-results/full-research-summary.json";

export const FullResearchOrchestratorErrorCode = {
  INVALID_ARGUMENT: "invalid-argument",
} as const;

export type FullResearchOrchestratorErrorCode =
  (typeof FullResearchOrchestratorErrorCode)[keyof typeof FullResearchOrchestratorErrorCode];

export class FullResearchOrchestratorError extends Error {
  readonly code: FullResearchOrchestratorErrorCode;

  constructor(message: string, code: FullResearchOrchestratorErrorCode) {
    super(message);
    this.name = "FullResearchOrchestratorError";
    this.code = code;
  }
}

export type FullResearchStepStatus = "succeeded" | "failed" | "skipped";

export type FullResearchRunStatus = "succeeded" | "failed" | "partial";

export type FullResearchStepDefinition = {
  id: string;
  label: string;
  npmScript: string;
  args: readonly string[];
  expectedOutputs: readonly string[];
  /** Upstream step ids that must succeed before this step runs. */
  upstreamStepIds: readonly string[];
  /** When true, the step still runs after upstream/core-chain failures. */
  independent: boolean;
};

export type FullResearchOrchestratorConfig = {
  continueOnError: boolean;
  summaryOutputPath: string;
};

export type FullResearchStepResult = {
  stepId: string;
  label: string;
  npmScript: string;
  command: string;
  status: FullResearchStepStatus;
  exitCode: number | null;
  durationMs: number;
  outputsGenerated: readonly string[];
  warnings: readonly string[];
  errorMessage?: string;
  stdoutTail?: string;
  stderrTail?: string;
};

export type FullResearchSummary = {
  generatedAt: string;
  outputPath: string;
  config: FullResearchOrchestratorConfig;
  status: FullResearchRunStatus;
  steps: readonly FullResearchStepResult[];
};

export type FullResearchOutputIo = {
  fileExists: (path: string) => boolean;
};

export type RunFullResearchOrchestratorInput = {
  config: FullResearchOrchestratorConfig;
  generatedAt: string;
  runner: ResearchPipelineRunner;
  log?: (message: string) => void;
  outputIo?: FullResearchOutputIo;
  isNpmScriptRegistered?: (npmScript: string) => boolean;
};

export type RunFullResearchOrchestratorOutput = {
  summary: FullResearchSummary;
  exitCode: number;
};
