export const STATIC_PARITY_SCAN_FILENAME = "static-parity-scan.json";
export const DEFAULT_STATIC_PARITY_SCAN_OUTPUT_PATH =
  "data/research-results/static-parity-scan.json";
export const DEFAULT_STATIC_PARITY_SCAN_HTML_PATH =
  "data/reports/static-parity-scan.html";
export const DEFAULT_STATIC_PARITY_SCAN_INPUT_DIR =
  "data/live-capture/forward-quotes";

export const STATIC_PARITY_SCAN_DISCLAIMER =
  "Diagnostic scan only. No trading decisions are made. No orders are placed. Parity observations are offline research signals and do not imply profitability.";

export const STATIC_PARITY_SCAN_CAVEATS = [
  "Gross parity violations may not survive fees, slippage, or queue priority.",
  "Top-of-book depth may be insufficient to execute at observed prices.",
  "Captured quotes may lag exchange state; settlement joins are not included.",
] as const;

export const STATIC_PARITY_CLASSIFICATIONS = [
  "no-signal",
  "parity-watch",
  "gross-parity-candidate",
  "buffer-adjusted-candidate",
  "invalid-book-state",
  "insufficient-book-depth",
] as const;

export type StaticParityClassification =
  (typeof STATIC_PARITY_CLASSIFICATIONS)[number];

export type StaticParityFrictionConfig = {
  feeBufferCents: number;
  minGrossEdgeCents: number;
  minSizeContracts: number;
  requireBothSidesPresent: boolean;
};

export const DEFAULT_STATIC_PARITY_FRICTION_CONFIG: StaticParityFrictionConfig = {
  feeBufferCents: 4,
  minGrossEdgeCents: 2,
  minSizeContracts: 1,
  requireBothSidesPresent: true,
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
  grossEdgeCents: number | null;
  estimatedNetEdgeCents: number | null;
  availableSize: number | null;
  classification: StaticParityClassification;
  reason: string;
};

export type StaticParityScanMetrics = {
  runCountScanned: number;
  runsSkipped: number;
  skipReasons: Record<string, number>;
  topOfBookRecordsScanned: number;
  validParitySnapshots: number;
  invalidSnapshots: number;
  insufficientDepthSnapshots: number;
  grossParityCandidateCount: number;
  bufferAdjustedCandidateCount: number;
  maxGrossEdgeCents: number | null;
  medianGrossEdgeCents: number | null;
  p95GrossEdgeCents: number | null;
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
  overallClassification: StaticParityClassification;
  hasBufferAdjustedCandidates: boolean;
  hasGrossCandidates: boolean;
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
