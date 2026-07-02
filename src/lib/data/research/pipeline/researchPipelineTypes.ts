export const RESEARCH_PIPELINE_SUMMARY_FILENAME = "pipeline-summary.json";
export const DEFAULT_RESEARCH_PIPELINE_SUMMARY_PATH =
  "data/research-results/pipeline-summary.json";
export const DEFAULT_RESEARCH_PIPELINE_SERIES = "KXBTC15M";
export const DEFAULT_RESEARCH_PIPELINE_LIMIT = 500;
export const DEFAULT_RESEARCH_PIPELINE_CONCURRENCY = 1;
export const DEFAULT_DISCOVERY_OUTPUT_PATH = "discovery-result.json";

export const ResearchPipelineErrorCode = {
  INVALID_ARGUMENT: "invalid-argument",
} as const;

export type ResearchPipelineErrorCode =
  (typeof ResearchPipelineErrorCode)[keyof typeof ResearchPipelineErrorCode];

export class ResearchPipelineError extends Error {
  readonly code: ResearchPipelineErrorCode;

  constructor(message: string, code: ResearchPipelineErrorCode) {
    super(message);
    this.name = "ResearchPipelineError";
    this.code = code;
  }
}

export type ResearchPipelineStepStatus = "succeeded" | "failed" | "skipped";

export type ResearchPipelineRunStatus = "succeeded" | "failed" | "partial";

export type ResearchPipelineStepDefinition = {
  id: string;
  label: string;
  npmScript: string;
  args: readonly string[];
};

export type ResearchPipelineConfig = {
  series: string;
  limit: number;
  concurrency: number;
  continueOnError: boolean;
  discoveryOutputPath: string;
  summaryOutputPath: string;
  rankBy: "totalPnL" | "sharpe" | "winRate";
};

export type ResearchPipelineStepResult = {
  stepId: string;
  label: string;
  npmScript: string;
  command: string;
  status: ResearchPipelineStepStatus;
  exitCode: number | null;
  durationMs: number;
  errorMessage?: string;
};

export type ResearchPipelineSummary = {
  generatedAt: string;
  outputPath: string;
  config: ResearchPipelineConfig;
  status: ResearchPipelineRunStatus;
  steps: readonly ResearchPipelineStepResult[];
};

export type ResearchPipelineRunnerResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

export type ResearchPipelineRunner = (
  npmScript: string,
  args: readonly string[],
) => Promise<ResearchPipelineRunnerResult>;

export type RunResearchPipelineInput = {
  config: ResearchPipelineConfig;
  generatedAt: string;
  runner: ResearchPipelineRunner;
  log?: (message: string) => void;
};

export type RunResearchPipelineOutput = {
  summary: ResearchPipelineSummary;
  exitCode: number;
};
