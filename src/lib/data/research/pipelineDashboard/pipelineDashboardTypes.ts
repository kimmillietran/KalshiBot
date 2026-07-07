import { DEFAULT_DATA_HEALTH_OUTPUT_PATH } from "@/lib/data/research/dataHealth/dataHealthTypes";
import { DEFAULT_FULL_RESEARCH_SUMMARY_PATH } from "@/lib/data/research/fullOrchestrator/fullResearchOrchestratorTypes";
import {
  COVERAGE_VALIDATION_OUTPUT_PATH,
  EXPANSION_REBUILD_SUMMARY_PATH,
  HISTORICAL_COVERAGE_PLAN_OUTPUT_PATH,
  HISTORICAL_EXPANSION_CONFIG_OUTPUT_PATH,
  HISTORICAL_EXPANSION_IMPORT_SUMMARY_PATH,
} from "@/lib/data/research/fullOrchestrator/coveragePhasePaths";
import { DEFAULT_HYPOTHESIS_CANDIDATES_OUTPUT_PATH } from "@/lib/data/research/hypothesisCandidates/hypothesisCandidateTypes";
import { DEFAULT_HYPOTHESIS_HISTORY_OUTPUT_PATH } from "@/lib/data/research/hypothesisEvolution/hypothesisEvolutionTypes";
import { DEFAULT_EXPANSION_RUN_HISTORY_OUTPUT_PATH } from "@/lib/data/research/expansionRunHistory/expansionRunHistoryTypes";
import { DEFAULT_RESEARCH_DIAGNOSTICS_INPUT_PATHS } from "@/lib/data/research/researchDiagnostics/researchDiagnosticsTypes";
import { DEFAULT_HYPOTHESIS_VALIDATION_OUTPUT_PATH } from "@/lib/data/research/hypothesisRobustness/hypothesisRobustnessTypes";
import { DEFAULT_STRATEGY_LEADERBOARD_OUTPUT_PATH } from "@/lib/data/research/leaderboard/strategyLeaderboardTypes";
import { DEFAULT_RESEARCH_PIPELINE_SUMMARY_PATH } from "@/lib/data/research/pipeline/researchPipelineTypes";

export const DEFAULT_RESEARCH_DASHBOARD_HTML_PATH =
  "data/reports/research-dashboard.html";
export const DEFAULT_RESEARCH_ARTIFACT_INDEX_PATH =
  "data/research-results/research-artifact-index.json";
export const DEFAULT_STRATEGY_SYNTHESIS_CANDIDATES_PATH =
  "data/research-results/strategy-synthesis-candidates.json";
export const DEFAULT_HARNESS_RESULTS_PATH =
  "data/research-results/harness-results.json";
export const DEFAULT_HARNESS_SUMMARY_FALLBACK_PATH =
  "data/research-results/harness/strategy-harness-summary.json";

export type PipelineDashboardInputPaths = {
  pipelineSummaryPath: string;
  fullResearchSummaryPath: string;
  artifactIndexPath: string;
  hypothesisCandidatesPath: string;
  hypothesisValidationPath: string;
  strategySynthesisPath: string;
  harnessResultsPath: string;
  harnessSummaryFallbackPath: string;
  strategyLeaderboardPath: string;
  dataHealthPath: string;
  historicalCoveragePlanPath: string;
  historicalExpansionConfigPath: string;
  coverageValidationPath: string;
  historicalExpansionImportSummaryPath: string;
  expansionRebuildSummaryPath: string;
  hypothesisHistoryPath: string;
  expansionRunHistoryPath: string;
  researchDiagnosticsPaths: import("@/lib/data/research/researchDiagnostics/researchDiagnosticsTypes").ResearchDiagnosticsInputPaths;
};

export const DEFAULT_PIPELINE_DASHBOARD_INPUT_PATHS: PipelineDashboardInputPaths = {
  pipelineSummaryPath: DEFAULT_RESEARCH_PIPELINE_SUMMARY_PATH,
  fullResearchSummaryPath: DEFAULT_FULL_RESEARCH_SUMMARY_PATH,
  artifactIndexPath: DEFAULT_RESEARCH_ARTIFACT_INDEX_PATH,
  hypothesisCandidatesPath: DEFAULT_HYPOTHESIS_CANDIDATES_OUTPUT_PATH,
  hypothesisValidationPath: DEFAULT_HYPOTHESIS_VALIDATION_OUTPUT_PATH,
  strategySynthesisPath: DEFAULT_STRATEGY_SYNTHESIS_CANDIDATES_PATH,
  harnessResultsPath: DEFAULT_HARNESS_RESULTS_PATH,
  harnessSummaryFallbackPath: DEFAULT_HARNESS_SUMMARY_FALLBACK_PATH,
  strategyLeaderboardPath: DEFAULT_STRATEGY_LEADERBOARD_OUTPUT_PATH,
  dataHealthPath: DEFAULT_DATA_HEALTH_OUTPUT_PATH,
  historicalCoveragePlanPath: HISTORICAL_COVERAGE_PLAN_OUTPUT_PATH,
  historicalExpansionConfigPath: HISTORICAL_EXPANSION_CONFIG_OUTPUT_PATH,
  coverageValidationPath: COVERAGE_VALIDATION_OUTPUT_PATH,
  historicalExpansionImportSummaryPath: HISTORICAL_EXPANSION_IMPORT_SUMMARY_PATH,
  expansionRebuildSummaryPath: EXPANSION_REBUILD_SUMMARY_PATH,
  hypothesisHistoryPath: DEFAULT_HYPOTHESIS_HISTORY_OUTPUT_PATH,
  expansionRunHistoryPath: DEFAULT_EXPANSION_RUN_HISTORY_OUTPUT_PATH,
  researchDiagnosticsPaths: DEFAULT_RESEARCH_DIAGNOSTICS_INPUT_PATHS,
};

export type PipelineStatusSection = {
  pipelineStatus: "succeeded" | "failed" | "partial" | "unknown";
  completedSteps: readonly string[];
  failedSteps: readonly string[];
  generatedAt: string | null;
  durationMs: number | null;
  totalSteps: number;
};

export type ArtifactHealthEntry = {
  artifactId: string;
  label: string;
  path: string;
  status: "present" | "stale" | "missing";
  lastModified: string | null;
};

export type ArtifactHealthSection = {
  present: number;
  stale: number;
  missing: number;
  artifactIndexPath: string;
  artifactIndexPresent: boolean;
  entries: readonly ArtifactHealthEntry[];
};

export type HypothesisSummarySection = {
  hypothesisCount: number;
  validatedCount: number;
  promotedCount: number;
  rejectedCount: number;
};

export type StrategySummarySection = {
  synthesizedStrategies: number;
  executedStrategies: number;
  topCandidateStrategyId: string | null;
  topCandidateRank: number | null;
  topCandidateTotalPnlCents: number | null;
};

export type ResearchHealthSection = {
  calibrationCoveragePct: number | null;
  atlasObservations: number | null;
  warningCount: number;
  dataHealthGeneratedAt: string | null;
  dataHealthSummary: string | null;
  dataHealthPath: string;
  dataHealthPresent: boolean;
};

export type CoverageArtifactStatus = {
  label: string;
  path: string;
  present: boolean;
  generatedAt: string | null;
  orchestratorStepStatus: "succeeded" | "failed" | "skipped" | null;
};

export type CoveragePhaseSection = {
  runMode: "read-only" | "import-executing" | "unknown";
  plan: CoverageArtifactStatus;
  expansionConfig: CoverageArtifactStatus;
  expansionImportExecution: CoverageArtifactStatus;
  rebuildAfterExpansion: CoverageArtifactStatus;
  coverageValidation: CoverageArtifactStatus;
  currentMarketCount: number | null;
  uniqueTradingDays: number | null;
  missingMonthCount: number | null;
  recommendedImportWindowCount: number | null;
  expansionJobCount: number | null;
  summary: string | null;
};

export type HistoricalImportabilitySection = {
  summaryPath: string;
  summaryPresent: boolean;
  supportedWindows: number;
  unsupportedWindows: number;
  historicalSuccessRate: number | null;
  totalAttempts: number;
  successfulImports: number;
  unsupportedMarkets: number;
};

export type HypothesisEvolutionSection = {
  historyPath: string;
  historyPresent: boolean;
  runCount: number;
  strongestImprovingHypothesis: string | null;
  largestRobustnessGain: number | null;
  largestObservationGrowth: number | null;
  approachingPromotion: readonly string[];
  regressedHypotheses: readonly string[];
  strengtheningCount: number;
  weakeningCount: number;
};

export type ExpansionRunHistorySection = {
  historyPath: string;
  historyPresent: boolean;
  runCount: number;
  latestRunGeneratedAt: string | null;
  latestImportedCount: number | null;
  latestImportsPerMinute: number | null;
  bestThroughputImportsPerMinute: number | null;
  bestThroughputGeneratedAt: string | null;
  worstBottleneckDiscoveryShare: number | null;
  worstBottleneckGeneratedAt: string | null;
  efficiencyImproving: boolean | null;
};

export type ResearchDiagnosticsSection =
  import("@/lib/data/research/researchDiagnostics/researchDiagnosticsTypes").ResearchDiagnosticsSection;

export type PipelineDashboardReport = {
  generatedAt: string;
  outputPath: string;
  inputPaths: PipelineDashboardInputPaths;
  pipelineStatus: PipelineStatusSection;
  artifactHealth: ArtifactHealthSection;
  hypothesisSummary: HypothesisSummarySection;
  strategySummary: StrategySummarySection;
  researchHealth: ResearchHealthSection;
  coveragePhase: CoveragePhaseSection;
  historicalImportability: HistoricalImportabilitySection;
  hypothesisEvolution: HypothesisEvolutionSection;
  expansionRunHistory: ExpansionRunHistorySection;
  researchDiagnostics: ResearchDiagnosticsSection;
};

export type BuildPipelineDashboardReportInput = {
  generatedAt: string;
  outputPath: string;
  inputPaths: PipelineDashboardInputPaths;
  inputs: ParsedPipelineDashboardInputs;
};

export type ParsedPipelineSummary = {
  generatedAt: string;
  status: "succeeded" | "failed" | "partial";
  steps: readonly {
    stepId: string;
    label: string;
    status: "succeeded" | "failed" | "skipped";
    durationMs: number;
  }[];
};

export type ParsedFullResearchOrchestratorSummary = {
  runMode: "read-only" | "import-executing" | "unknown";
  executeExpansionImport: boolean;
};

export type ParsedArtifactIndex = {
  generatedAt: string;
  outputPath: string;
  artifacts: readonly {
    artifactId: string;
    name: string;
    path: string;
    status: "present" | "stale" | "missing";
    generatedTimestamp: string | null;
  }[];
};

export type ParsedHypothesisCandidates = {
  generatedAt: string;
  candidates: readonly { candidateId: string }[];
};

export type ParsedHypothesisValidation = {
  generatedAt: string;
  validations: readonly {
    hypothesisId: string;
    passes: boolean;
  }[];
  summary: {
    passingCount: number;
    failingCount: number;
  };
};

export type ParsedStrategySynthesis = {
  generatedAt: string;
  strategies: readonly {
    strategyId: string;
    hypothesisId: string;
    promotionStatus: "experimental" | "candidate" | "rejected";
  }[];
  summary: {
    synthesizedCount: number;
    promotionCounts: {
      experimental: number;
      candidate: number;
      rejected: number;
    };
  };
};

export type ParsedHarnessResults = {
  completedAt: string;
  evaluatedStrategies: number;
  successfulRuns: number;
  results: readonly {
    synthesizedStrategyId: string;
    hypothesisId: string;
    status: "success" | "failed" | "skipped";
  }[];
};

export type ParsedStrategyLeaderboard = {
  generatedAt: string;
  rankBy: string;
  strategies: readonly {
    rank: number;
    strategyId: string;
    totalPnlCents: number;
  }[];
};

export type ParsedDataHealthReport = {
  generatedAt: string;
  outputPath: string;
  pipelineCoverage: {
    calibrationReports: number;
    researchOutputs: number;
  };
  researchCoverage: {
    calibrationCoveragePct: number | null;
    mispricingAtlasPresent: boolean;
  };
  artifactFreshness: {
    staleDependencyWarnings: readonly { message: string }[];
  };
  stageStatuses: readonly {
    stageLabel: string;
    status: "green" | "yellow" | "red";
    reason: string;
  }[];
  recommendations: readonly { action: string; reason: string }[];
};

export type ParsedMispricingAtlasSummary = {
  totalAtlasObservations: number | null;
};

export type ParsedHistoricalCoveragePlan = {
  generatedAt: string;
  summary: {
    currentMarketCount: number | null;
    uniqueTradingDays: number | null;
    missingMonths: readonly string[];
    recommendedImportWindows: readonly unknown[];
  };
};

export type ParsedHistoricalExpansionConfig = {
  generatedAt: string;
  jobs: readonly unknown[];
  summary: {
    jobCount: number | null;
    estimatedMarketCount: number | null;
  };
};

export type ParsedCoverageValidation = {
  generatedAt: string;
  summary: {
    inconclusiveInsufficientCoverageCount: number | null;
  };
};

export type ParsedExpansionImportSummary = {
  generatedAt: string;
  document: import("@/lib/data/research/coveragePlanner/importability").ExpansionImportSummaryDocument;
};

export type ParsedPipelineDashboardInputs = {
  pipelineSummary: ParsedPipelineSummary | null;
  fullResearchSummary: ParsedPipelineSummary | null;
  fullResearchOrchestrator: ParsedFullResearchOrchestratorSummary | null;
  artifactIndex: ParsedArtifactIndex | null;
  hypothesisCandidates: ParsedHypothesisCandidates | null;
  hypothesisValidation: ParsedHypothesisValidation | null;
  strategySynthesis: ParsedStrategySynthesis | null;
  harnessResults: ParsedHarnessResults | null;
  strategyLeaderboard: ParsedStrategyLeaderboard | null;
  dataHealth: ParsedDataHealthReport | null;
  mispricingAtlas: ParsedMispricingAtlasSummary | null;
  historicalCoveragePlan: ParsedHistoricalCoveragePlan | null;
  historicalExpansionConfig: ParsedHistoricalExpansionConfig | null;
  coverageValidation: ParsedCoverageValidation | null;
  historicalExpansionImportSummary: ParsedExpansionImportSummary | null;
  expansionRebuildSummary: { generatedAt: string } | null;
  hypothesisHistory: import("@/lib/data/research/hypothesisEvolution/hypothesisEvolutionTypes").HypothesisHistoryDocument | null;
  expansionRunHistory: import("@/lib/data/research/expansionRunHistory/expansionRunHistoryTypes").ExpansionRunHistoryDocument | null;
  loadedResearchDiagnostics: import("@/lib/data/research/researchDiagnostics/loadResearchDiagnosticsInputs").LoadedResearchDiagnosticsInputs;
};

export type PipelineDashboardIo = {
  readFile: (path: string) => string;
  fileExists: (path: string) => boolean;
};

export class PipelineDashboardError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PipelineDashboardError";
  }
}
