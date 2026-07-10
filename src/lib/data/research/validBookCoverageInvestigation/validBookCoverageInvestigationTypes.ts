export const VALID_BOOK_COVERAGE_INVESTIGATION_FILENAME =
  "valid-book-coverage-investigation.json";
export const DEFAULT_VALID_BOOK_COVERAGE_INVESTIGATION_OUTPUT_PATH =
  "data/research-results/valid-book-coverage-investigation.json";
export const DEFAULT_VALID_BOOK_COVERAGE_INVESTIGATION_HTML_PATH =
  "data/reports/valid-book-coverage-investigation.html";
export const DEFAULT_VALID_BOOK_COVERAGE_INPUT_DIR =
  "data/live-capture/forward-quotes";

export const VALID_BOOK_COVERAGE_DISCLAIMER =
  "Diagnostic investigation only. No trading decisions are made. No orders are placed. Findings inform capture quality and research readiness only.";

export const VALID_BOOK_COVERAGE_CAVEATS = [
  "Capture-valid reflects sequence/snapshot state, not economic book consistency.",
  "Economically-valid uses complement-derived asks (legacy diagnostic).",
  "M12.7 bid-only parity diagnostics are the default research model per M12.6 semantics validation.",
  "yesBid + noBid > 100 is a bid-book imbalance, not guaranteed arbitrage.",
] as const;

export const ROOT_CAUSE_CLASSIFICATIONS = [
  "capture-reconstruction-issue",
  "bid-only-book-semantics",
  "scanner-field-mapping-issue",
  "market-depth-actually-missing",
  "market-selection-issue",
  "rollover-timing-issue",
  "throttle-policy-issue",
  "insufficient-sample-size",
  "unknown",
] as const;

export type RootCauseClassification =
  (typeof ROOT_CAUSE_CLASSIFICATIONS)[number];

export const M12_3_EXPECTED_TOP_OF_BOOK_FIELDS = [
  "yesBestBidCents",
  "yesBestAskCents",
  "noBestBidCents",
  "noBestAskCents",
  "yesBestBidSize",
  "yesBestAskSize",
  "noBestBidSize",
  "noBestAskSize",
  "bookState",
] as const;

export type ValidBookCoverageInputPaths = {
  forwardQuotesDir: string;
};

export const DEFAULT_VALID_BOOK_COVERAGE_INPUT_PATHS: ValidBookCoverageInputPaths =
  {
    forwardQuotesDir: DEFAULT_VALID_BOOK_COVERAGE_INPUT_DIR,
  };

export type ValidityBreakdown = {
  totalTopOfBookRecords: number;
  captureValidRecords: number;
  captureInvalidRecords: number;
  economicallyValidRecords: number;
  parityUsableRecords: number;
  invalidBookStateRecords: number;
  insufficientDepthRecords: number;
  missingYesBidRecords: number;
  missingYesAskRecords: number;
  missingNoBidRecords: number;
  missingNoAskRecords: number;
  missingYesSideRecords: number;
  missingNoSideRecords: number;
  crossedYesBookRecords: number;
  crossedNoBookRecords: number;
  lockedYesBookRecords: number;
  lockedNoBookRecords: number;
  impossiblePriceRecords: number;
  outOfRangePriceRecords: number;
  zeroOrNullSizeRecords: number;
  captureValidShare: number | null;
  economicValidShare: number | null;
  parityUsableShare: number | null;
};

export type CrossedImpliedAskDiagnostics = {
  yesBidGreaterThanYesAskCount: number;
  yesBidEqualsYesAskCount: number;
  noBidGreaterThanNoAskCount: number;
  noBidEqualsNoAskCount: number;
  yesAskMatchesDerivedFromNoBidCount: number;
  noAskMatchesDerivedFromYesBidCount: number;
  negativeImpliedSpreadBeforeClampCount: number;
  spreadClampedToZeroSuspicionCount: number;
};

export type YesNoPairingDiagnostics = {
  yesBestBidCentsPresentShare: number | null;
  yesBestAskCentsPresentShare: number | null;
  noBestBidCentsPresentShare: number | null;
  noBestAskCentsPresentShare: number | null;
  yesNoFieldsPopulatedTogetherShare: number | null;
  expectedFieldNames: readonly string[];
  observedFieldNames: string[];
  scannerFieldMappingOk: boolean;
  pairingNotes: string[];
};

export type InvalidSampleRecord = {
  timestamp: string;
  runId: string;
  marketTicker: string;
  validityClass: string;
  yesBidCents: number | null;
  yesAskCents: number | null;
  noBidCents: number | null;
  noAskCents: number | null;
  bookState: string;
  reason: string;
};

export type MarketValidityBreakdown = {
  marketTicker: string;
  recordsSeen: number;
  captureValidRecords: number;
  economicallyValidRecords: number;
  parityUsableRecords: number;
  invalidRecords: number;
  firstSeenTimestamp: string | null;
  firstCaptureValidTimestamp: string | null;
  firstEconomicallyValidTimestamp: string | null;
  lastEconomicallyValidTimestamp: string | null;
  firstInvalidTimestamp: string | null;
  lastInvalidTimestamp: string | null;
  yesBidPresentCount: number;
  yesAskPresentCount: number;
  noBidPresentCount: number;
  noAskPresentCount: number;
  dominantInvalidReason: string | null;
};

export type TimingDiagnostics = {
  timeFromSubscriptionToFirstRecordMs: number | null;
  timeFromFirstRecordToFirstEconomicallyValidMs: number | null;
  invalidDurationBeforeFirstEconomicallyValidMs: number | null;
  recordsInFirst10Seconds: number;
  recordsInLast10Seconds: number;
  recordsAfterRolloverSubscription: number;
  recordsNearMarketClose: number;
  invalidToValidTransitionCount: number;
  validToInvalidTransitionCount: number;
};

export type ThrottleDiagnostics = {
  topOfBookThrottleMs: number | null;
  recordsNearThrottleIntervalCount: number;
  invalidShareNearThrottleEmits: number | null;
  invalidToValidTransitionsCaptured: number;
  validToInvalidTransitionsCaptured: number;
  firstEconomicallyValidBriefWindowSuspected: boolean;
  recommendedCapturePolicyFixes: string[];
};

export type InvestigatedRunSummary = {
  runId: string;
  scanned: boolean;
  skipReason: string | null;
  validityBreakdown: ValidityBreakdown;
  crossedImpliedAsk: CrossedImpliedAskDiagnostics;
  timing: TimingDiagnostics;
  throttle: ThrottleDiagnostics;
  markets: MarketValidityBreakdown[];
  crossedImpliedBookRecords: number;
};

export type ValidBookCoverageSummary = {
  captureValidRecords: number;
  economicallyValidRecords: number;
  parityUsableRecords: number;
  crossedImpliedBookRecords: number;
  insufficientDepthRecords: number;
  scannerFieldMappingOk: boolean;
  rootCauseClassification: RootCauseClassification;
  secondaryContributors: RootCauseClassification[];
  recommendedNextFix: string;
  whyOnlyFewParityUsable: string;
  isCaptureReconstructingCorrectly: boolean;
  isCaptureValidDifferentFromEconomicallyValid: boolean;
  areYesNoBooksAvailable: boolean;
  invalidConcentrationSummary: string;
};

export type ValidBookCoverageInvestigationReport = {
  generatedAt: string;
  outputPath: string;
  htmlOutputPath: string;
  disclaimer: string;
  caveats: readonly string[];
  inputPaths: ValidBookCoverageInputPaths;
  summary: ValidBookCoverageSummary;
  aggregateValidityBreakdown: ValidityBreakdown;
  aggregateCrossedImpliedAsk: CrossedImpliedAskDiagnostics;
  yesNoPairing: YesNoPairingDiagnostics;
  throttle: ThrottleDiagnostics;
  invalidSamples: readonly InvalidSampleRecord[];
  runs: readonly InvestigatedRunSummary[];
  warnings: readonly string[];
};

export type ValidBookCoverageInvestigationIo = {
  readFile: (path: string) => string;
  fileExists: (path: string) => boolean;
  readdir: (path: string) => readonly string[];
  isDirectory: (path: string) => boolean;
};

export class ValidBookCoverageInvestigationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidBookCoverageInvestigationError";
  }
}
