export const RESEARCH_EXPERIMENT_RECORD_FILENAME = "experiment.json";
export const DEFAULT_RESEARCH_EXPERIMENTS_DIR =
  "data/research-results/experiments";
export const DEFAULT_RESEARCH_EXPERIMENT_INDEX_PATH =
  "data/research-results/experiment-index.json";
export const DEFAULT_RESEARCH_EXPERIMENTS_HTML_PATH =
  "data/reports/research-experiments.html";
export const RESEARCH_EXPERIMENT_ID_PREFIX = "rex-v1";

export const ResearchExperimentManagerErrorCode = {
  INVALID_ARGUMENT: "invalid-argument",
  IMMUTABLE_RECORD_CONFLICT: "immutable-record-conflict",
  PARSE_ERROR: "parse-error",
} as const;

export type ResearchExperimentManagerErrorCode =
  (typeof ResearchExperimentManagerErrorCode)[keyof typeof ResearchExperimentManagerErrorCode];

export class ResearchExperimentManagerError extends Error {
  readonly code: ResearchExperimentManagerErrorCode;
  readonly experimentId?: string;

  constructor(
    message: string,
    code: ResearchExperimentManagerErrorCode,
    options?: { experimentId?: string },
  ) {
    super(message);
    this.name = "ResearchExperimentManagerError";
    this.code = code;
    this.experimentId = options?.experimentId;
  }
}

export type ResearchExperimentInputPaths = {
  pipelineSummaryPath: string;
  fullResearchSummaryPath: string;
  hypothesisCandidatesPath: string;
  hypothesisValidationPath: string;
  strategySynthesisPath: string;
  harnessResultsPath: string;
  candidatePromotionsPath: string;
  artifactIndexPath: string;
};

export type ResearchExperimentPipelineConfiguration = {
  pipeline: Record<string, unknown> | null;
  fullResearch: Record<string, unknown> | null;
};

export type ResearchExperimentValidationSummary = {
  totalHypotheses: number;
  passingCount: number;
  failingCount: number;
  averageRobustnessScore: number | null;
};

export type ResearchExperimentHarnessSummary = {
  totalStrategies: number;
  evaluatedCount: number;
  recommendationCounts: Record<string, number>;
};

export type ResearchExperimentPromotionSummary = {
  totalStrategies: number;
  decisionCounts: Record<string, number>;
  watchlistCount: number;
  rejectedCount: number;
};

export type ResearchExperimentTopCandidate = {
  strategyId: string;
  hypothesisId: string;
  strategyFamily: string;
  decision: string;
  robustnessScore: number | null;
};

export type ResearchExperimentPromotionSnapshotEntry = {
  strategyId: string;
  hypothesisId: string;
  decision: string;
  robustnessScore: number | null;
};

export type ResearchExperimentRuntime = {
  pipelineDurationMs: number | null;
  fullResearchDurationMs: number | null;
  totalDurationMs: number | null;
};

export type ResearchExperimentArtifactSnapshot = {
  artifactId: string;
  status: string;
  generatedTimestamp: string | null;
};

export type ResearchExperimentRecord = {
  experimentId: string;
  timestamp: string;
  gitCommit: string | null;
  pipelineConfiguration: ResearchExperimentPipelineConfiguration;
  hypothesisCount: number | null;
  validationSummary: ResearchExperimentValidationSummary | null;
  synthesizedStrategyCount: number | null;
  harnessSummary: ResearchExperimentHarnessSummary | null;
  candidatePromotionSummary: ResearchExperimentPromotionSummary | null;
  promotionSnapshot: readonly ResearchExperimentPromotionSnapshotEntry[];
  topCandidate: ResearchExperimentTopCandidate | null;
  warnings: readonly string[];
  runtime: ResearchExperimentRuntime;
  artifactSnapshot: readonly ResearchExperimentArtifactSnapshot[];
  inputPaths: ResearchExperimentInputPaths;
  recordPath: string;
};

export type ResearchExperimentIndexEntry = {
  experimentId: string;
  timestamp: string;
  recordPath: string;
  present: boolean;
};

export type PromotionDecisionChange = {
  strategyId: string;
  previousDecision: string | null;
  currentDecision: string | null;
};

export type ArtifactStatusChange = {
  artifactId: string;
  previousStatus: string | null;
  currentStatus: string | null;
};

export type ExperimentPairComparison = {
  baselineExperimentId: string;
  compareExperimentId: string;
  baselinePresent: boolean;
  comparePresent: boolean;
  hypothesisCountDelta: number | null;
  averageRobustnessDelta: number | null;
  promotionChanges: readonly PromotionDecisionChange[];
  candidateChanges: {
    added: readonly string[];
    removed: readonly string[];
    unchanged: readonly string[];
  };
  pipelineDurationDeltaMs: number | null;
  fullResearchDurationDeltaMs: number | null;
  artifactChanges: readonly ArtifactStatusChange[];
};

export type ResearchExperimentIndex = {
  generatedAt: string;
  outputPath: string;
  htmlOutputPath: string;
  latestExperimentId: string | null;
  experiments: readonly ResearchExperimentIndexEntry[];
  latestComparison: ExperimentPairComparison | null;
};

export type ParsedExperimentInputs = {
  pipelineSummary: {
    config: Record<string, unknown>;
    status: string;
    steps: readonly { durationMs: number; warnings: readonly string[] }[];
  } | null;
  fullResearchSummary: {
    config: Record<string, unknown>;
    status: string;
    steps: readonly { durationMs: number; warnings: readonly string[] }[];
  } | null;
  hypothesisCount: number | null;
  validationSummary: ResearchExperimentValidationSummary | null;
  synthesizedStrategyCount: number | null;
  harnessSummary: ResearchExperimentHarnessSummary | null;
  promotionSummary: ResearchExperimentPromotionSummary | null;
  promotions: readonly {
    strategyId: string;
    hypothesisId: string;
    strategyFamily: string;
    decision: string;
    robustnessScore: number | null;
    warnings: readonly string[];
  }[];
  artifactSnapshot: readonly ResearchExperimentArtifactSnapshot[];
  warnings: readonly string[];
};

export type ResearchExperimentManagerIo = {
  readFile: (path: string) => string;
  writeFile: (path: string, data: string) => void;
  fileExists: (path: string) => boolean;
  resolveGitCommit?: () => string | null;
};

export type RegisterResearchExperimentInput = {
  generatedAt: string;
  inputPaths: ResearchExperimentInputPaths;
  experimentsDir: string;
  indexOutputPath: string;
  htmlOutputPath: string;
  gitCommit?: string | null;
  io: ResearchExperimentManagerIo;
};

export type RegisterResearchExperimentResult = {
  record: ResearchExperimentRecord;
  index: ResearchExperimentIndex;
  indexOutputPath: string;
  htmlOutputPath: string;
};

export const DEFAULT_RESEARCH_EXPERIMENT_INPUT_PATHS: ResearchExperimentInputPaths =
  {
    pipelineSummaryPath: "data/research-results/pipeline-summary.json",
    fullResearchSummaryPath: "data/research-results/full-research-summary.json",
    hypothesisCandidatesPath: "data/research-results/hypothesis-candidates.json",
    hypothesisValidationPath: "data/research-results/hypothesis-validation.json",
    strategySynthesisPath:
      "data/research-results/strategy-synthesis-candidates.json",
    harnessResultsPath: "data/research-results/harness-results.json",
    candidatePromotionsPath: "data/research-results/candidate-promotions.json",
    artifactIndexPath: "data/research-results/research-artifact-index.json",
  };
