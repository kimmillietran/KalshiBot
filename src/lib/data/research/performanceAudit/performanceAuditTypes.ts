import type { FullResearchOrchestratorConfig } from "@/lib/data/research/fullOrchestrator/fullResearchOrchestratorTypes";

export const RESEARCH_PERFORMANCE_AUDIT_FILENAME = "research-performance-audit.json";
export const DEFAULT_RESEARCH_PERFORMANCE_AUDIT_OUTPUT_PATH =
  "data/research-results/research-performance-audit.json";
export const DEFAULT_RESEARCH_PERFORMANCE_AUDIT_HTML_PATH =
  "data/reports/research-performance-audit.html";

export const DEFAULT_PERFORMANCE_AUDIT_FULL_RESEARCH_SUMMARY_PATH =
  "data/research-results/full-research-summary.json";
export const DEFAULT_PERFORMANCE_AUDIT_ARTIFACT_INDEX_PATH =
  "data/research-results/research-artifact-index.json";
export const DEFAULT_PERFORMANCE_AUDIT_COVERAGE_PLAN_PATH =
  "data/research-results/historical-coverage-plan.json";
export const DEFAULT_PERFORMANCE_AUDIT_EXPERIMENT_INDEX_PATH =
  "data/research-results/experiment-index.json";

export const PerformanceAuditErrorCode = {
  INVALID_JSON: "invalid-json",
  INVALID_DOCUMENT: "invalid-document",
  MISSING_INPUT: "missing-input",
} as const;

export type PerformanceAuditErrorCode =
  (typeof PerformanceAuditErrorCode)[keyof typeof PerformanceAuditErrorCode];

export class PerformanceAuditError extends Error {
  readonly code: PerformanceAuditErrorCode;

  constructor(message: string, code: PerformanceAuditErrorCode) {
    super(message);
    this.name = "PerformanceAuditError";
    this.code = code;
  }
}

export type PerformanceAuditConfig = {
  outputPath: string;
  htmlOutputPath: string;
  fullResearchSummaryPath: string;
  artifactIndexPath: string;
  historicalCoveragePlanPath: string;
  experimentIndexPath: string;
};

export type DirectoryScanProfile = {
  rootPath: string;
  recursive: boolean;
  purpose: string;
};

export type NetworkOperationProfile = {
  description: string;
  estimatedShare: number;
};

export type PipelineStepResourceProfile = {
  stepId: string;
  filesRead: readonly string[];
  filesWritten: readonly string[];
  directoryScans: readonly DirectoryScanProfile[];
  networkOperations: readonly NetworkOperationProfile[];
  cpuBoundShare: number;
  ioBoundShare: number;
  largeJsonInputs: readonly string[];
  fullDirectoryRecompute: boolean;
};

export type PerformanceAuditStepReport = {
  stepId: string;
  label: string;
  npmScript: string;
  status: "succeeded" | "failed" | "skipped" | "not-run";
  durationMs: number;
  percentOfTotalRuntime: number;
  filesRead: readonly string[];
  filesWritten: readonly string[];
  upstreamDependencies: readonly string[];
  downstreamDependents: readonly string[];
  primaryArtifactSizeBytes: number | null;
  cpuBoundEstimateMs: number;
  ioBoundEstimateMs: number;
  networkEstimateMs: number;
  executionRisk?: "import-execution" | "networked-rebuild";
};

export type ParallelExecutionGroup = {
  groupId: string;
  stepIds: readonly string[];
  combinedDurationMs: number;
  estimatedSavingsMs: number;
  rationale: string;
};

export type DuplicateArtifactLoad = {
  artifactPath: string;
  readingStepIds: readonly string[];
  totalReadCount: number;
  estimatedWastedMs: number;
  recommendation: string;
};

export type DuplicateFilesystemScan = {
  rootPath: string;
  scanningStepIds: readonly string[];
  scanCount: number;
  estimatedWastedMs: number;
  recommendation: string;
};

export type CacheOpportunity = {
  stepId: string;
  inputArtifacts: readonly string[];
  outputArtifacts: readonly string[];
  estimatedSavingsMs: number;
  rationale: string;
};

export type IncrementalRebuildOpportunity = {
  stepId: string;
  scannedRoots: readonly string[];
  estimatedSavingsMs: number;
  rationale: string;
};

export type NetworkBottleneck = {
  stepId: string;
  operations: readonly NetworkOperationProfile[];
  estimatedNetworkMs: number;
  estimatedLocalMs: number;
  recommendation: string;
};

export type MemoryObservation = {
  stepId: string;
  artifactPath: string;
  fileSizeBytes: number | null;
  estimatedDeserializeMs: number;
  recommendation: string;
};

export type CriticalPathStep = {
  stepId: string;
  durationMs: number;
  cumulativeMs: number;
};

export type CriticalPathAnalysis = {
  stepIds: readonly string[];
  totalDurationMs: number;
  steps: readonly CriticalPathStep[];
};

export type OptimizationOpportunity = {
  rank: number;
  category:
    | "parallel-execution"
    | "duplicate-loading"
    | "duplicate-scan"
    | "cache"
    | "incremental-rebuild"
    | "network"
    | "memory"
    | "critical-path";
  title: string;
  description: string;
  estimatedSavingsMs: number;
  affectedStepIds: readonly string[];
};

export type PerformanceAuditInputStatus = {
  fullResearchSummaryPresent: boolean;
  artifactIndexPresent: boolean;
  historicalCoveragePlanPresent: boolean;
  experimentIndexPresent: boolean;
};

export type PerformanceAuditSummary = {
  totalRuntimeMs: number;
  estimatedParallelRuntimeMs: number;
  estimatedCacheSavingsMs: number;
  estimatedIncrementalRebuildSavingsMs: number;
  stepCount: number;
  succeededStepCount: number;
  failedStepCount: number;
  skippedStepCount: number;
};

export type PerformanceAuditReport = {
  generatedAt: string;
  outputPath: string;
  htmlOutputPath: string;
  config: PerformanceAuditConfig;
  orchestratorConfig: FullResearchOrchestratorConfig | null;
  inputStatus: PerformanceAuditInputStatus;
  summary: PerformanceAuditSummary;
  steps: readonly PerformanceAuditStepReport[];
  parallelExecutionGroups: readonly ParallelExecutionGroup[];
  duplicateArtifactLoads: readonly DuplicateArtifactLoad[];
  duplicateFilesystemScans: readonly DuplicateFilesystemScan[];
  cacheOpportunities: readonly CacheOpportunity[];
  incrementalRebuildOpportunities: readonly IncrementalRebuildOpportunity[];
  networkBottlenecks: readonly NetworkBottleneck[];
  memoryObservations: readonly MemoryObservation[];
  criticalPath: CriticalPathAnalysis;
  optimizationOpportunities: readonly OptimizationOpportunity[];
  auditNotes: readonly string[];
};

export type PerformanceAuditIo = {
  readFile: (path: string) => string;
  fileExists: (path: string) => boolean;
};

export type BuildResearchPerformanceAuditInput = {
  generatedAt: string;
  config: PerformanceAuditConfig;
  io: PerformanceAuditIo;
};
