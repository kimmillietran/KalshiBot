export const RESEARCH_PIPELINE_SUMMARY_FILENAME = "pipeline-summary.json";
export const DEFAULT_RESEARCH_PIPELINE_SUMMARY_PATH =
  "data/research-results/pipeline-summary.json";
export const DEFAULT_RESEARCH_PIPELINE_SERIES = "KXBTC15M";
export const DEFAULT_RESEARCH_PIPELINE_LIMIT = 500;
export const DEFAULT_RESEARCH_PIPELINE_CONCURRENCY = 1;
export const DEFAULT_DISCOVERY_OUTPUT_PATH = "discovery-result.json";
export const DEFAULT_PIPELINE_IMPORT_MIN_REQUEST_DELAY_MS = 100;
export const DEFAULT_PIPELINE_IMPORT_MAX_REQUEST_DELAY_MS = 3000;
export const DEFAULT_PIPELINE_IMPORT_FIXED_REQUEST_DELAY_MS = 1000;

export type ResearchPipelineImportThrottleConfig = {
  adaptiveThrottleEnabled: boolean;
  minRequestDelayMs: number;
  maxRequestDelayMs: number;
  fixedRequestDelayMs: number | null;
};

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
  strictDependencies: boolean;
  discoveryOutputPath: string;
  summaryOutputPath: string;
  rankBy: "totalPnL" | "sharpe" | "winRate";
  importThrottle: ResearchPipelineImportThrottleConfig;
};

export type ResearchPipelineStepDependencyFields = {
  dependencyStatus: "passed" | "warning" | "failed";
  missingDependencies: readonly string[];
  staleDependencies: readonly string[];
  warnings: readonly string[];
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
  stdoutTail?: string;
  stderrTail?: string;
} & ResearchPipelineStepDependencyFields;

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
  dependencyIo?: import("@/lib/data/research/dependencyValidation").ResearchDependencyIo;
};

export type RunResearchPipelineOutput = {
  summary: ResearchPipelineSummary;
  exitCode: number;
};
