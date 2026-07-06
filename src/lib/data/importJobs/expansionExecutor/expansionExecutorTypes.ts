import type { HistoricalBronzeImportConfig } from "@/lib/data/importJobs/config";
import type { HistoricalBronzeImportJobResult } from "@/lib/data/importJobs/historicalBronzeImportJobTypes";
import type { MarketDiscoveryProvenance } from "@/lib/data/discovery/discoveryTypes";
import type { HistoricalExpansionImportJob } from "@/lib/data/importJobs/expansionConfig";
import { DEFAULT_HISTORICAL_EXPANSION_IMPORT_CHECKPOINT_PATH } from "@/lib/data/importJobs/expansionImportSafety/expansionImportSafetyTypes";

import type { ExpansionImportRateLimitDiagnostics } from "./expansionImportRateLimit";
import type { ExpansionImportAdaptiveThrottleDiagnostics } from "./expansionImportAdaptiveThrottle";
import type { ExpansionDiscoveryDeltaRefreshDiagnostics } from "./expansionDiscoveryCache/expansionDiscoveryCacheTypes";
import type { DiscoveryCacheSegmentStrategy } from "./expansionDiscoveryCache/expansionDiscoveryCacheTypes";
import type { ExpansionImportResumeDiagnostics } from "@/lib/data/importJobs/expansionImportSafety/expansionImportResumeSemantics";
import type {
  ExpansionImportSampleStrategy,
  ExpansionImportSelectionCounts,
} from "./expansionImportSelectionTypes";

export const DEFAULT_HISTORICAL_EXPANSION_IMPORT_CONFIG_PATH =
  "data/import-configs/historical-expansion-config.json";
export const DEFAULT_HISTORICAL_EXPANSION_IMPORT_SUMMARY_PATH =
  "data/research-results/historical-expansion-import-summary.json";
export const DEFAULT_HISTORICAL_EXPANSION_IMPORT_SUMMARY_HTML_PATH =
  "data/reports/historical-expansion-import-summary.html";
export { DEFAULT_HISTORICAL_EXPANSION_IMPORT_CHECKPOINT_PATH };
export const DEFAULT_EXPANSION_IMPORT_CONFIGS_DIR = "data/import-configs";
export const DEFAULT_EXPANSION_IMPORTS_DIR = "data/imports";
export const DEFAULT_EXPANSION_FIXTURES_DIR = "data/fixtures";
export const DEFAULT_EXPANSION_RESEARCH_RESULTS_DIR = "data/research-results";
export {
  DEFAULT_EXPANSION_DISCOVERY_CACHE_DIR,
  DEFAULT_DISCOVERY_CACHE_SEGMENT,
  DEFAULT_DISCOVERY_CACHE_TTL_HOURS,
} from "./expansionDiscoveryCache/expansionDiscoveryCacheTypes";
export {
  DEFAULT_SINGLE_MARKET_EXPANSION_IMPORT_DEBUG_HTML_PATH,
  DEFAULT_SINGLE_MARKET_EXPANSION_IMPORT_DEBUG_JSON_PATH,
} from "./singleMarketExpansionImportDebugTypes";

export const ExpansionExecutorErrorCode = {
  MISSING_EXPANSION_CONFIG: "missing-expansion-config",
  INVALID_EXPANSION_CONFIG: "invalid-expansion-config",
  NO_SCHEDULED_JOBS: "no-scheduled-jobs",
  JOB_NOT_FOUND: "job-not-found",
} as const;

export type ExpansionExecutorErrorCode =
  (typeof ExpansionExecutorErrorCode)[keyof typeof ExpansionExecutorErrorCode];

export class ExpansionExecutorError extends Error {
  readonly code: ExpansionExecutorErrorCode;

  constructor(message: string, code: ExpansionExecutorErrorCode) {
    super(message);
    this.name = "ExpansionExecutorError";
    this.code = code;
  }
}

export type ExpansionImportMarketStatus =
  | "planned"
  | "imported"
  | "skipped"
  | "failed";

export type ExpansionImportMarketResult = {
  marketTicker: string;
  seriesTicker: string;
  status: ExpansionImportMarketStatus;
  configPath: string | null;
  importResultPath: string | null;
  errorMessage: string | null;
  skipReason: string | null;
  durationMs: number | null;
};

export type ExpansionImportJobRunStatus = "completed" | "skipped" | "failed";

export type ExpansionImportJobResult = {
  jobId: string;
  seriesTicker: string;
  status: ExpansionImportJobRunStatus;
  discoveredMarketCount: number;
  importedCount: number;
  skippedCount: number;
  failedCount: number;
  plannedCount: number;
  unsupportedCount: number;
  skippedUnsupportedCount: number;
  selection: ExpansionImportSelectionCounts;
  durationMs: number;
  warnings: readonly string[];
  markets: readonly ExpansionImportMarketResult[];
};

export type ExpansionImportSummaryRunStatus =
  | "completed"
  | "partial"
  | "interrupted";

export type HistoricalExpansionImportSummary = {
  generatedAt: string;
  execute: boolean;
  inputPath: string;
  outputPath: string;
  htmlOutputPath: string;
  checkpointPath: string | null;
  resume: boolean;
  maxRetries: number;
  runStatus: ExpansionImportSummaryRunStatus;
  importConfigsDir: string;
  importsDir: string;
  maxMarkets: number | null;
  jobIdFilter: string | null;
  sampleStrategy: ExpansionImportSampleStrategy;
  selection: ExpansionImportSelectionCounts;
  summary: {
    jobCount: number;
    discoveredMarketCount: number;
    importedCount: number;
    skippedCount: number;
    failedCount: number;
    plannedCount: number;
    unsupportedCount: number;
    skippedUnsupportedCount: number;
    selectedSupportedMarkets: number;
    selectedUnknownMarkets: number;
    selectedUnsupportedMarkets: number;
    durationMs: number;
  };
  jobs: readonly ExpansionImportJobResult[];
  warnings: readonly string[];
  rateLimitDiagnostics: ExpansionImportRateLimitDiagnostics;
  adaptiveThrottleDiagnostics: ExpansionImportAdaptiveThrottleDiagnostics;
  resumeDiagnostics: ExpansionImportResumeDiagnostics;
  discoveryDiagnostics: ExpansionDiscoveryDeltaRefreshDiagnostics;
};

export type HistoricalExpansionImportExecutorConfig = {
  inputPath: string;
  outputPath: string;
  htmlOutputPath: string;
  importConfigsDir: string;
  importsDir: string;
  fixturesDir: string;
  researchResultsDir: string;
  execute: boolean;
  maxMarkets: number | null;
  jobId: string | null;
  resume: boolean;
  skipFailed: boolean;
  retryFailed: boolean;
  retryUnsupported: boolean;
  verifyResumeArtifacts: boolean;
  forceMarket: string | null;
  checkpointPath: string;
  maxRetries: number;
  summaryInputPath: string | null;
  traceMarket: string | null;
  marketTicker: string | null;
  singleMarketOutputPath: string;
  singleMarketHtmlOutputPath: string;
  rateLimitBackoffMs: number;
  maxRateLimitRetries: number;
  sampleStrategy: ExpansionImportSampleStrategy;
  adaptiveThrottle: boolean;
  minBackoffMs: number;
  maxBackoffMs: number;
  backoffMultiplier: number;
  successDecayAfter: number;
  discoveryCacheDir: string;
  discoveryCacheSegment: DiscoveryCacheSegmentStrategy;
  discoveryCacheTtlHours: number | null;
  useDiscoveryCache: boolean;
  refreshDiscoveryCache: boolean;
  refreshDiscoveryMonth: string | null;
};

export type ExpansionImportProgressHooks = {
  reportJobHeader: (snapshot: {
    dryRun: boolean;
    resume: boolean;
    maxMarkets: number | null;
    jobIndex: number;
    totalJobs: number;
    jobId: string;
    seriesTicker: string;
    windowLabel: string;
    discoveredCount: number;
    alreadyCoveredCount: number;
    toImportCount: number;
  }) => void;
  recordMarket: (status: ExpansionImportMarketStatus, marketTicker: string) => void;
  recordDedupedMarket: (marketTicker: string) => void;
  reportAbortGuard?: (lines: readonly string[]) => void;
  completeJob: () => void;
  complete: () => void;
};

export type ExpansionExecutorIo = {
  readdir: (path: string) => readonly string[];
  readFile: (path: string) => string;
  fileExists: (path: string) => boolean;
  isDirectory: (path: string) => boolean;
  writeFile: (path: string, data: string) => void;
  mkdirSync: (path: string, options: { recursive: boolean }) => void;
};

export type RunHistoricalExpansionImportInput = {
  generatedAt: string;
  config: HistoricalExpansionImportExecutorConfig;
  expansionConfigJson: string;
  io: ExpansionExecutorIo;
  deps: ExpansionExecutorDeps;
  signal?: AbortSignal | null;
  sleep?: (ms: number) => Promise<void>;
  onPersist?: (artifacts: {
    checkpointJson: string;
    summaryJson: string;
  }) => void;
  progress?: ExpansionImportProgressHooks | null;
  reconciliationTrace?: import("./expansionImportReconciliationTrace").ExpansionImportReconciliationTracer | null;
};

export type ExpansionDiscoveredMarket = {
  marketTicker: string;
  seriesTicker: string;
  eventTicker: string;
  status: string;
  openTime: string | null;
  closeTime: string | null;
  settlementTime: string | null;
  expirationValue: string | null;
  title: string | null;
  subtitle: string | null;
  listMarketWire: import("@/lib/data/importers/kalshi/kalshiMarketImportDiagnostics").KalshiMarketWireShape;
  provenance: MarketDiscoveryProvenance;
};

export type ExpansionExecutorDeps = {
  discoverMarkets: (
    seriesTicker: string,
    sampling: { after: string; before: string },
  ) => Promise<readonly ExpansionDiscoveredMarket[]>;
  runImport: (
    config: HistoricalBronzeImportConfig,
    options?: {
      reconciliationTrace?: import("./expansionImportReconciliationTrace").ExpansionImportReconciliationTracer | null;
    },
  ) => Promise<HistoricalBronzeImportJobResult>;
};

export type PlannedExpansionMarket = {
  job: HistoricalExpansionImportJob;
  marketTicker: string;
  seriesTicker: string;
  config: HistoricalBronzeImportConfig;
  configPath: string;
  importResultPath: string;
};
