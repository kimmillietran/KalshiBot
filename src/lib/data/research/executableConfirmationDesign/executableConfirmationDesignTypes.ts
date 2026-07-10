export const EXECUTABLE_CONFIRMATION_DESIGN_FILENAME =
  "executable-confirmation-design.json";
export const DEFAULT_EXECUTABLE_CONFIRMATION_DESIGN_OUTPUT_PATH =
  "data/research-results/executable-confirmation-design.json";
export const DEFAULT_EXECUTABLE_CONFIRMATION_DESIGN_HTML_PATH =
  "data/reports/executable-confirmation-design.html";

export const DEFAULT_STATIC_PARITY_SCAN_ARTIFACT_PATH =
  "data/research-results/static-parity-scan.json";
export const DEFAULT_BID_ONLY_CANDIDATE_LIFECYCLE_ARTIFACT_PATH =
  "data/research-results/bid-only-candidate-lifecycle.json";
export const DEFAULT_FORWARD_CAPTURE_READINESS_ARTIFACT_PATH =
  "data/research-results/forward-capture-readiness.json";

export const EXECUTABLE_CONFIRMATION_DESIGN_DISCLAIMER =
  "This is a confirmation design harness, not an execution engine. No trading decisions are made. No orders are placed. No trade recommendations are emitted.";

export const EXECUTABLE_CONFIRMATION_DESIGN_CAVEATS = [
  "Bid-only parity candidates (yesBid + noBid > 100) are research diagnostics until executable confirmation exists.",
  "This harness defines what confirmation would require; it does not confirm live actionability.",
  "Forward WebSocket captures may lack full bid ladders, fee models, or settlement joins needed for confirmation.",
  "confirmed-executable-looking is a schema exercise only — not permission to trade.",
] as const;

export const CONFIRMATION_REQUIRED_DATA_FIELDS = [
  "yesBidCents",
  "noBidCents",
  "yesBidSize",
  "noBidSize",
  "bidLadderDepth",
  "feeModel",
  "stalenessBoundMs",
  "marketStatusOpen",
  "minSizeContracts",
  "confirmationSource",
  "timestampAlignment",
  "settlementOutcomeContext",
] as const;

export type ConfirmationRequiredDataField =
  (typeof CONFIRMATION_REQUIRED_DATA_FIELDS)[number];

export const CONFIRMATION_SOURCES = [
  "forward-ws",
  "rest-orderbook",
  "paper-sim",
  "unknown",
] as const;

export type ConfirmationSource = (typeof CONFIRMATION_SOURCES)[number];

export const CONFIRMATION_STATUSES = [
  "confirmed-not-executable",
  "confirmed-executable-looking",
  "insufficient-depth",
  "stale-book",
  "missing-fee-model",
  "missing-orderbook-depth",
  "unsupported",
] as const;

export type ConfirmationStatus = (typeof CONFIRMATION_STATUSES)[number];

export const CONFIRMATION_RECOMMENDED_NEXT_FIXES = [
  "build-rest-orderbook-confirmation-spike",
  "build-forward-ws-depth-confirmation",
  "collect-more-candidates",
  "add-fee-model",
  "join-settlements-first",
] as const;

export type ConfirmationRecommendedNextFix =
  (typeof CONFIRMATION_RECOMMENDED_NEXT_FIXES)[number];

export type ExecutableConfirmationRecord = {
  timestamp: string;
  marketTicker: string;
  candidateId: string;
  pricingModel: "bid-only";
  yesBidCents: number | null;
  noBidCents: number | null;
  yesBidSize: number | null;
  noBidSize: number | null;
  bidSumCents: number | null;
  bidOnlyEdgeCents: number | null;
  feeBufferCents: number;
  minSizeContracts: number;
  confirmationSource: ConfirmationSource;
  confirmationStatus: ConfirmationStatus;
  reason: string;
  availableDataFields: readonly ConfirmationRequiredDataField[];
  missingDataFields: readonly ConfirmationRequiredDataField[];
};

export type ExecutableConfirmationDesignInputPaths = {
  staticParityScanPath: string;
  bidOnlyCandidateLifecyclePath: string;
  forwardCaptureReadinessPath: string;
};

export const DEFAULT_EXECUTABLE_CONFIRMATION_DESIGN_INPUT_PATHS: ExecutableConfirmationDesignInputPaths =
  {
    staticParityScanPath: DEFAULT_STATIC_PARITY_SCAN_ARTIFACT_PATH,
    bidOnlyCandidateLifecyclePath: DEFAULT_BID_ONLY_CANDIDATE_LIFECYCLE_ARTIFACT_PATH,
    forwardCaptureReadinessPath: DEFAULT_FORWARD_CAPTURE_READINESS_ARTIFACT_PATH,
  };

export type ExecutableConfirmationDesignConfig = {
  feeBufferCents: number;
  minSizeContracts: number;
  stalenessBoundMs: number;
};

export const DEFAULT_EXECUTABLE_CONFIRMATION_DESIGN_CONFIG: ExecutableConfirmationDesignConfig =
  {
    feeBufferCents: 4,
    minSizeContracts: 1,
    stalenessBoundMs: 5_000,
  };

export type ExecutableConfirmationDataAssessment = {
  staticParityScanPresent: boolean;
  bidOnlyCandidateLifecyclePresent: boolean;
  forwardCaptureReadinessPresent: boolean;
  candidateCountFromStaticScan: number;
  candidateCountFromLifecycle: number;
  candidatesWithBidSizes: number;
  candidatesWithConfirmationSource: number;
  candidatesWithFeeModel: number;
  missingFieldsSummary: readonly string[];
};

export type ExecutableConfirmationDesignSummary = {
  confirmationSupported: boolean;
  confirmationStatus: ConfirmationStatus | "no-candidates";
  requiredDataFields: readonly ConfirmationRequiredDataField[];
  availableDataFields: readonly ConfirmationRequiredDataField[];
  missingDataFields: readonly ConfirmationRequiredDataField[];
  candidateCountAssessed: number;
  confirmedExecutableCandidateCount: number;
  unsupportedCandidateCount: number;
  recommendedNextFix: ConfirmationRecommendedNextFix;
  actionabilityBlockers: readonly string[];
};

export type ExecutableConfirmationDesignReport = {
  generatedAt: string;
  outputPath: string;
  htmlOutputPath: string;
  disclaimer: string;
  caveats: readonly string[];
  inputPaths: ExecutableConfirmationDesignInputPaths;
  config: ExecutableConfirmationDesignConfig;
  summary: ExecutableConfirmationDesignSummary;
  dataAssessment: ExecutableConfirmationDataAssessment;
  confirmationRecords: readonly ExecutableConfirmationRecord[];
  exampleConfirmationRecord: ExecutableConfirmationRecord;
};

export type ExecutableConfirmationDesignIo = {
  readFile: (path: string) => string;
  fileExists: (path: string) => boolean;
};

export class ExecutableConfirmationDesignError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExecutableConfirmationDesignError";
  }
}

/** Module paths that must never be imported by this design-only harness. */
export const FORBIDDEN_EXECUTABLE_CONFIRMATION_IMPORT_PREFIXES = [
  "@/features/trading",
  "@/lib/trading/execution",
  "@/lib/trading/orders",
  "@/app/api/kalshi/orders",
] as const;
