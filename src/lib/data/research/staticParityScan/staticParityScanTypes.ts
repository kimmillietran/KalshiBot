export const STATIC_PARITY_SCAN_FILENAME = "static-parity-scan.json";
export const DEFAULT_STATIC_PARITY_SCAN_OUTPUT_PATH =
  "data/research-results/static-parity-scan.json";
export const DEFAULT_STATIC_PARITY_SCAN_HTML_PATH =
  "data/reports/static-parity-scan.html";
export const DEFAULT_STATIC_PARITY_SCAN_INPUT_DIR =
  "data/live-capture/forward-quotes";

export const PARITY_PRICING_MODELS = ["bid-only", "complement-derived"] as const;
export type ParityPricingModel = (typeof PARITY_PRICING_MODELS)[number];

export const STATIC_PARITY_SCAN_DISCLAIMER =
  "Diagnostic scan only. No trading decisions are made. No orders are placed. Kalshi forward captures expose bid-only YES/NO ladders; yesBid + noBid > 100 is a bid-book imbalance, not guaranteed arbitrage. Executable confirmation is required before treating any candidate as actionable.";

export const STATIC_PARITY_SCAN_CAVEATS = [
  "M12.6 found no explicit ask ladders in captured Kalshi orderbook payloads.",
  "M12.7 uses bid-only parity diagnostics by default; complement-derived asks are legacy/diagnostic only.",
  "Gross bid-book imbalance may not survive fees, slippage, queue priority, or execution timing.",
  "Buffer-adjusted candidates are research signals only — not actionable trades without executable confirmation.",
  "Captured quotes may lag exchange state; settlement joins are not included.",
  "Bid-only parity requires min(yesBestBidSize, noBestBidSize) >= 1 contract; sub-contract or dust sizes block evaluation (see M12.8 bid-size-coverage audit).",
] as const;

export const COMPLEMENT_PARITY_CLASSIFICATIONS = [
  "no-signal",
  "parity-watch",
  "gross-parity-candidate",
  "buffer-adjusted-candidate",
  "invalid-book-state",
  "insufficient-book-depth",
] as const;

export type ComplementParityClassification =
  (typeof COMPLEMENT_PARITY_CLASSIFICATIONS)[number];

export const BID_ONLY_PARITY_CLASSIFICATIONS = [
  "bid-only-no-signal",
  "bid-only-watch",
  "bid-only-gross-candidate",
  "bid-only-buffer-adjusted-candidate",
  "bid-only-insufficient-depth",
  "bid-only-invalid-price",
] as const;

export type BidOnlyParityClassification =
  (typeof BID_ONLY_PARITY_CLASSIFICATIONS)[number];

export type StaticParityClassification =
  | ComplementParityClassification
  | BidOnlyParityClassification;

export type StaticParityFrictionConfig = {
  pricingModel: ParityPricingModel;
  feeBufferCents: number;
  minGrossEdgeCents: number;
  minBidOnlyEdgeCents: number;
  minSizeContracts: number;
  requireBothSidesPresent: boolean;
  requireExecutableConfirmation: boolean;
};

export const DEFAULT_STATIC_PARITY_FRICTION_CONFIG: StaticParityFrictionConfig = {
  pricingModel: "bid-only",
  feeBufferCents: 4,
  minGrossEdgeCents: 2,
  minBidOnlyEdgeCents: 2,
  minSizeContracts: 1,
  requireBothSidesPresent: true,
  requireExecutableConfirmation: true,
};

export type StaticParityScanInputPaths = {
  forwardQuotesDir: string;
};

export const DEFAULT_STATIC_PARITY_SCAN_INPUT_PATHS: StaticParityScanInputPaths = {
  forwardQuotesDir: DEFAULT_STATIC_PARITY_SCAN_INPUT_DIR,
};

export type StaticParityCandidateSample = {
  timestamp: string;
  runId: string;
  marketTicker: string;
  eventTicker: string | null;
  yesBidCents: number | null;
  yesAskCents: number | null;
  noBidCents: number | null;
  noAskCents: number | null;
  yesAskPlusNoAskCents: number | null;
  yesBidPlusNoBidCents: number | null;
  bidSumCents: number | null;
  bidOnlyEdgeCents: number | null;
  grossEdgeCents: number | null;
  estimatedNetEdgeCents: number | null;
  availableSize: number | null;
  minBidSizeContracts: number | null;
  classification: StaticParityClassification;
  reason: string;
  requiresExecutableConfirmation: boolean;
};

export type StaticParityScanMetrics = {
  pricingModel: ParityPricingModel;
  runCountScanned: number;
  runsSkipped: number;
  skipReasons: Record<string, number>;
  topOfBookRecordsScanned: number;
  validParitySnapshots: number;
  invalidSnapshots: number;
  insufficientDepthSnapshots: number;
  grossParityCandidateCount: number;
  bufferAdjustedCandidateCount: number;
  bidOnlyRecordsEvaluated: number;
  bidOnlyNoSignalCount: number;
  bidOnlyWatchCount: number;
  bidOnlyGrossCandidateCount: number;
  bidOnlyBufferAdjustedCandidateCount: number;
  executableConfirmedCandidateCount: number;
  maxGrossEdgeCents: number | null;
  medianGrossEdgeCents: number | null;
  p95GrossEdgeCents: number | null;
  maxBidOnlyEdgeCents: number | null;
  medianBidOnlyEdgeCents: number | null;
  p95BidOnlyEdgeCents: number | null;
  totalCandidateDurationMs: number;
  longestCandidateDurationMs: number;
  marketsInvolved: string[];
  eventTickersInvolved: string[];
  timeRangeStart: string | null;
  timeRangeEnd: string | null;
  malformedLineCount: number;
  warnings: string[];
};

export type StaticParityScanSummary = {
  pricingModel: ParityPricingModel;
  overallClassification: StaticParityClassification;
  hasBufferAdjustedCandidates: boolean;
  hasGrossCandidates: boolean;
  hasBidOnlyGrossCandidates: boolean;
  hasBidOnlyBufferAdjustedCandidates: boolean;
  requiresExecutableConfirmation: boolean;
  recommendedNextAction: string;
};

export type StaticParityScanReport = {
  generatedAt: string;
  outputPath: string;
  htmlOutputPath: string;
  disclaimer: string;
  caveats: readonly string[];
  inputPaths: StaticParityScanInputPaths;
  friction: StaticParityFrictionConfig;
  summary: StaticParityScanSummary;
  metrics: StaticParityScanMetrics;
  candidateSamples: readonly StaticParityCandidateSample[];
  runs: readonly {
    runId: string;
    scanned: boolean;
    skipReason: string | null;
    topOfBookRecordCount: number;
    grossCandidateCount: number;
    bufferAdjustedCandidateCount: number;
    bidOnlyGrossCandidateCount: number;
    bidOnlyBufferAdjustedCandidateCount: number;
  }[];
};

export type StaticParityScanIo = {
  readFile: (path: string) => string;
  fileExists: (path: string) => boolean;
  readdir: (path: string) => readonly string[];
  isDirectory: (path: string) => boolean;
};

export class StaticParityScanError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StaticParityScanError";
  }
}

// Backward-compatible export alias.
export const STATIC_PARITY_CLASSIFICATIONS = COMPLEMENT_PARITY_CLASSIFICATIONS;
