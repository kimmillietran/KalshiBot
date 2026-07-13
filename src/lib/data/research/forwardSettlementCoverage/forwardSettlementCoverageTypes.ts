export const FORWARD_SETTLEMENT_COVERAGE_FILENAME =
  "forward-settlement-coverage.json";
export const DEFAULT_FORWARD_SETTLEMENT_COVERAGE_OUTPUT_PATH =
  "data/research-results/forward-settlement-coverage.json";
export const DEFAULT_FORWARD_SETTLEMENT_COVERAGE_HTML_PATH =
  "data/reports/forward-settlement-coverage.html";
export const DEFAULT_FORWARD_SETTLEMENT_BACKFILL_CHECKPOINT_PATH =
  "data/research-results/forward-settlement-backfill-checkpoint.json";

export const DEFAULT_IMPORTS_DIR = "data/imports";

export const FORWARD_SETTLEMENT_COVERAGE_DISCLAIMER =
  "Settlement coverage analysis enables offline outcome joins. It does not imply trades were executable. No trading decisions are made. No orders are placed.";

export const FORWARD_SETTLEMENT_COVERAGE_CAVEATS = [
  "Coverage is scoped to one selected capture run; other runs are ignored.",
  "Unsettled markets are recorded as unresolved, not counted as covered.",
  "Conflicting settlement sources are flagged and never silently merged.",
  "Backfill reuses existing historical bronze import infrastructure.",
] as const;

export const SETTLEMENT_COVERAGE_CLASSIFICATIONS = [
  "settlement-ready",
  "settlement-present-but-stale",
  "settlement-present-but-conflicting",
  "market-not-yet-settled",
  "missing-settlement-source",
  "missing-market-metadata",
  "import-failed",
  "invalid-market",
] as const;

export type SettlementCoverageClassification =
  (typeof SETTLEMENT_COVERAGE_CLASSIFICATIONS)[number];

export const BACKFILL_MARKET_STATUSES = [
  "pending",
  "skipped-ready",
  "skipped-unsettled",
  "skipped-conflict",
  "skipped-not-candidate",
  "imported",
  "failed",
  "dry-run-planned",
] as const;

export type BackfillMarketStatus = (typeof BACKFILL_MARKET_STATUSES)[number];

export type ForwardSettlementCoverageConfig = {
  captureRunDir: string;
  importsDir: string;
  outputPath: string;
  htmlOutputPath: string;
  checkpointPath: string;
  dryRun: boolean;
  resume: boolean;
  maxConcurrency: number;
  maxRetries: number;
  retryBaseDelayMs: number;
  staleAfterCaptureObservation: boolean;
};

export type ForwardSettlementCoverageIo = {
  readFile: (path: string) => string;
  fileExists: (path: string) => boolean;
  readdir: (path: string) => readonly string[];
  isDirectory: (path: string) => boolean;
  writeFile?: (path: string, data: string) => void;
  mkdirSync?: (path: string, options?: { recursive?: boolean }) => void;
};

export type CapturedMarketInventoryEntry = {
  marketTicker: string;
  seriesTicker: string;
  firstObservedAt: string;
  lastObservedAt: string;
  observationCount: number;
  marketCloseTime: string | null;
  expectedSettlementAvailability: "available" | "pending" | "unknown";
  eventTicker: string | null;
  sourceArtifacts: readonly string[];
};

export type ParsedSettlementCandidate = {
  settledOutcome: "yes" | "no";
  settlementTime: string | null;
  openTime: string | null;
  closeTime: string | null;
  eventTicker: string | null;
  contentType: string | null;
  sourceArtifact: string;
  retrievedAt: string | null;
  joinConfidence: "high" | "medium";
};

export type MarketSettlementCoverageEntry = {
  marketTicker: string;
  seriesTicker: string;
  classification: SettlementCoverageClassification;
  settledOutcome: "yes" | "no" | "unknown";
  settlementTime: string | null;
  sourceArtifact: string | null;
  retrievedAt: string | null;
  conflictReason: string | null;
  exclusionReason: string | null;
  nextEligibleRetryAt: string | null;
  inventory: CapturedMarketInventoryEntry;
};

export type ForwardSettlementCoverageSummary = {
  analysisScope: "selected-run";
  selectedRunId: string;
  selectedRunDirectory: string;
  sourceRunIds: readonly string[];
  capturedMarketCount: number;
  settledMarketCount: number;
  joinedMarketCount: number;
  unresolvedMarketCount: number;
  coverageShare: number | null;
  readyMarketCount: number;
  staleMarketCount: number;
  conflictingMarketCount: number;
  pendingMarketCount: number;
  missingSourceMarketCount: number;
  importFailedMarketCount: number;
  neverAttemptedMarketCount: number;
  retryDeferredMarketCount: number;
  attemptedMarketCount: number;
  invalidMarketCount: number;
  excludedFromJoinCount: number;
  recommendedNextAction: string;
  warnings: readonly string[];
  errors: readonly string[];
};

export type ForwardSettlementJoinIntegration = {
  overallVerdict: string;
  recommendedNextAction: string;
  settlementKnownMarketCount: number;
  settlementCoverageShare: number | null;
  marketsExcludedFromJoin: readonly {
    marketTicker: string;
    reason: string;
  }[];
  joinOutputPath: string | null;
};

export type ForwardSettlementCoverageReport = {
  generatedAt: string;
  artifactGeneratedAt: string;
  outputPath: string;
  htmlOutputPath: string;
  disclaimer: string;
  caveats: readonly string[];
  config: ForwardSettlementCoverageConfig;
  summary: ForwardSettlementCoverageSummary;
  inventory: readonly CapturedMarketInventoryEntry[];
  markets: readonly MarketSettlementCoverageEntry[];
  joinIntegration: ForwardSettlementJoinIntegration;
  backfill: ForwardSettlementBackfillSummary | null;
};

export const FORWARD_SETTLEMENT_BACKFILL_IMPLEMENTATION_VERSION =
  "m13.2b-kalshi-rest-settlement-fallback";

export type ForwardSettlementBackfillErrorCategory =
  | "btc-provider-unexpectedly-required"
  | "kalshi-market-request-failed"
  | "kalshi-settlement-request-failed"
  | "kalshi-market-not-found"
  | "kalshi-event-not-found"
  | "kalshi-endpoint-not-found"
  | "kalshi-settlement-not-found"
  | "market-not-settled"
  | "normalization-failed"
  | "artifact-write-failed"
  | "unknown";

export type ForwardSettlementBackfillCheckpointMarket = {
  marketTicker: string;
  status: BackfillMarketStatus;
  attempts: number;
  lastAttemptAt: string | null;
  nextEligibleRetryAt: string | null;
  errorMessage: string | null;
  errorCategory: ForwardSettlementBackfillErrorCategory | null;
  importResultPath: string | null;
};

export type ForwardSettlementBackfillCheckpoint = {
  version: 1;
  implementationVersion?: string;
  captureRunDir: string;
  selectedRunId: string;
  importsDir: string;
  startedAt: string;
  updatedAt: string;
  dryRun: boolean;
  markets: ForwardSettlementBackfillCheckpointMarket[];
};

export type ForwardSettlementBackfillMarketResult = {
  marketTicker: string;
  status: BackfillMarketStatus;
  attempts: number;
  errorMessage: string | null;
  errorCategory: ForwardSettlementBackfillErrorCategory | null;
  importResultPath: string | null;
  nextEligibleRetryAt: string | null;
};

export type ForwardSettlementBackfillSummary = {
  dryRun: boolean;
  resumed: boolean;
  attemptedMarketCount: number;
  importedMarketCount: number;
  skippedMarketCount: number;
  failedMarketCount: number;
  retryDeferredMarketCount: number;
  unsettledMarketCount: number;
  checkpointPath: string;
  marketResults: readonly ForwardSettlementBackfillMarketResult[];
};

export type ForwardSettlementBackfillDeps = {
  runMarketImport: (input: {
    market: CapturedMarketInventoryEntry;
    configPath: string;
    importResultPath: string;
    dryRun: boolean;
  }) => Promise<{ success: boolean; errorMessage?: string; skipped?: boolean }>;
  sleep?: (ms: number) => Promise<void>;
};

export class ForwardSettlementCoverageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ForwardSettlementCoverageError";
  }
}
