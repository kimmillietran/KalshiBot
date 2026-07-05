import {
  DEFAULT_EXPANSION_IMPORT_CONFIGS_DIR,
  DEFAULT_EXPANSION_IMPORTS_DIR,
  DEFAULT_HISTORICAL_EXPANSION_IMPORT_CHECKPOINT_PATH,
  DEFAULT_HISTORICAL_EXPANSION_IMPORT_SUMMARY_PATH,
} from "@/lib/data/importJobs/expansionExecutor/expansionExecutorTypes";

export const EXPANSION_IMPORT_PERFORMANCE_AUDIT_FILENAME =
  "expansion-import-performance-audit.json";
export const DEFAULT_EXPANSION_IMPORT_PERFORMANCE_AUDIT_OUTPUT_PATH =
  "data/research-results/expansion-import-performance-audit.json";
export const DEFAULT_EXPANSION_IMPORT_PERFORMANCE_AUDIT_HTML_PATH =
  "data/reports/expansion-import-performance-audit.html";

export {
  DEFAULT_HISTORICAL_EXPANSION_IMPORT_SUMMARY_PATH,
  DEFAULT_HISTORICAL_EXPANSION_IMPORT_CHECKPOINT_PATH,
  DEFAULT_EXPANSION_IMPORT_CONFIGS_DIR,
  DEFAULT_EXPANSION_IMPORTS_DIR,
};

export const ExpansionImportPerformanceAuditErrorCode = {
  INVALID_JSON: "invalid-json",
  INVALID_DOCUMENT: "invalid-document",
  MISSING_INPUT: "missing-input",
} as const;

export type ExpansionImportPerformanceAuditErrorCode =
  (typeof ExpansionImportPerformanceAuditErrorCode)[keyof typeof ExpansionImportPerformanceAuditErrorCode];

export class ExpansionImportPerformanceAuditError extends Error {
  readonly code: ExpansionImportPerformanceAuditErrorCode;

  constructor(message: string, code: ExpansionImportPerformanceAuditErrorCode) {
    super(message);
    this.name = "ExpansionImportPerformanceAuditError";
    this.code = code;
  }
}

export type ExpansionImportPerformanceAuditConfig = {
  outputPath: string;
  htmlOutputPath: string;
  expansionImportSummaryPath: string;
  expansionImportCheckpointPath: string;
  importConfigsDir: string;
  importsDir: string;
};

export type ExpansionImportPerformanceAuditIo = {
  readFile: (path: string) => string;
  fileExists: (path: string) => boolean;
  readdir: (path: string) => readonly string[];
  isDirectory: (path: string) => boolean;
};

export type ExpansionImportDirectoryStats = {
  rootPath: string;
  present: boolean;
  fileCount: number;
  totalBytes: number;
  expansionConfigCount: number;
  importResultCount: number;
};

export type ExpansionImportPerformanceAuditInputStatus = {
  expansionImportSummaryPresent: boolean;
  expansionImportCheckpointPresent: boolean;
  importConfigsDirPresent: boolean;
  importsDirPresent: boolean;
};

export type DurationPercentiles = {
  p50Ms: number | null;
  p95Ms: number | null;
  p99Ms: number | null;
};

export type FailureBreakdownEntry = {
  category: string;
  count: number;
  share: number;
};

export type SlowMarketEntry = {
  marketTicker: string;
  seriesTicker: string;
  status: string;
  durationMs: number;
  errorMessage: string | null;
};

export type ThroughputBucket = {
  bucket: string;
  importedCount: number;
  failedCount: number;
  attemptedCount: number;
  importsPerMinute: number | null;
};

export type TimeEstimateBreakdown = {
  discoveryTimeEstimateMs: number;
  dedupeTimeEstimateMs: number;
  importWriteTimeEstimateMs: number | null;
  activeImportTimeMs: number;
  backoffTimeMs: number;
  unattributedOverheadMs: number;
};

export type ExpansionImportPerformanceSummaryMetrics = {
  totalElapsedMs: number;
  importsPerMinute: number | null;
  averageImportDurationMs: number | null;
  importDurationPercentiles: DurationPercentiles;
  rateLimitedCount: number;
  backoffDurationMs: number;
  backoffShareOfElapsed: number;
  retryCount: number;
  importedCount: number;
  failedCount: number;
  skippedCount: number;
  plannedCount: number;
  discoveredMarketCount: number;
  unsupportedCount: number;
  skippedUnsupportedCount: number;
  maxMarkets: number | null;
  execute: boolean;
  runStatus: string;
};

export type ExpansionImportOptimizationSuggestion = {
  id: string;
  category:
    | "adaptive-backoff"
    | "batching"
    | "parallelism"
    | "checkpoint-resume"
    | "unsupported-filter"
    | "discovery-dedupe";
  title: string;
  rationale: string;
  estimatedImpact: "high" | "medium" | "low";
  safeToApply: boolean;
};

export type ExpansionImportPerformanceRecommendations = {
  recommendedBatchSize: number | null;
  recommendedBackoffMs: number | null;
  adaptiveThrottlingWouldHelp: boolean;
  adaptiveThrottlingRationale: string;
  parallelismSafetyAssessment: string;
  optimizations: readonly ExpansionImportOptimizationSuggestion[];
};

export type ExpansionImportPerformanceAuditReport = {
  generatedAt: string;
  outputPath: string;
  htmlOutputPath: string;
  config: ExpansionImportPerformanceAuditConfig;
  inputStatus: ExpansionImportPerformanceAuditInputStatus;
  inputPaths: {
    expansionImportSummaryPath: string;
    expansionImportCheckpointPath: string;
    importConfigsDir: string;
    importsDir: string;
  };
  summaryMetrics: ExpansionImportPerformanceSummaryMetrics;
  timeEstimates: TimeEstimateBreakdown;
  failedMarketBreakdown: readonly FailureBreakdownEntry[];
  unsupportedMarketBreakdown: readonly FailureBreakdownEntry[];
  slowestMarkets: readonly SlowMarketEntry[];
  throughputByHour: readonly ThroughputBucket[];
  throughputByMonth: readonly ThroughputBucket[];
  throughputByWindow: readonly ThroughputBucket[];
  importConfigsStats: ExpansionImportDirectoryStats;
  importsDirStats: ExpansionImportDirectoryStats;
  recommendations: ExpansionImportPerformanceRecommendations;
};

export type BuildExpansionImportPerformanceAuditInput = {
  generatedAt: string;
  config: ExpansionImportPerformanceAuditConfig;
  io: ExpansionImportPerformanceAuditIo;
};
