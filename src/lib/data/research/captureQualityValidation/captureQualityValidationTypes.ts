export const CAPTURE_QUALITY_VALIDATION_FILENAME = "capture-quality-validation.json";
export const DEFAULT_CAPTURE_QUALITY_VALIDATION_OUTPUT_PATH =
  "data/research-results/capture-quality-validation.json";
export const DEFAULT_CAPTURE_QUALITY_VALIDATION_HTML_OUTPUT_PATH =
  "data/reports/capture-quality-validation.html";
export const DEFAULT_FORWARD_QUOTES_SCAN_DIR = "data/live-capture/forward-quotes";

export const CAPTURE_QUALITY_VALIDATION_DISCLAIMER =
  "Offline capture quality validation only. No trading decisions are made. No orders are placed. Artifacts are read-only.";

export const CAPTURE_QUALITY_VALIDATION_CAVEATS = [
  "Legacy capture-valid means sequence/snapshot-valid, not economically-valid.",
  "Recomputed economic validity uses the same rules as M12.4 classifyTopOfBookValidity.",
  "Health JSON may lag M12.4B field additions; mismatches are reported, not auto-fixed.",
] as const;

export type CaptureFormatClassification =
  | "legacy-format"
  | "economic-state-format"
  | "mixed-format"
  | "unknown-format";

export type CaptureQualityValidationThresholds = {
  minEconomicallyValidShare: number;
  minParityUsableRecords: number;
  maxHealthCountMismatch: number;
  maxEconomicStateMismatchRecords: number;
  maxMalformedJsonlLines: number;
  maxEmptyRolloverRecordShare: number;
};

export type CaptureQualityValidationConfig = {
  forwardQuotesDir: string;
  thresholds: CaptureQualityValidationThresholds;
};

export type CaptureQualityValidationIo = {
  readFile: (path: string) => string;
  fileExists: (path: string) => boolean;
  readdir: (path: string) => readonly string[];
  isDirectory: (path: string) => boolean;
};

export type ParsedTopOfBookValidationRecord = {
  lineNumber: number;
  marketTicker: string;
  eventTicker: string | null;
  receivedAtLocal: string;
  receivedAtMs: number;
  bookState: string;
  yesBestBidCents: number | null;
  yesBestAskCents: number | null;
  noBestBidCents: number | null;
  noBestAskCents: number | null;
  yesBestBidSize: number | null;
  yesBestAskSize: number | null;
  noBestBidSize: number | null;
  noBestAskSize: number | null;
  yesSpreadCents: number | null;
  noSpreadCents: number | null;
  reportedEconomicBookState: string | null;
  reportedIsEconomicallyValid: boolean | null;
  reportedIsParityUsable: boolean | null;
  reportedIsCrossed: boolean | null;
  reportedIsLocked: boolean | null;
};

export type RecomputedValidityCounts = {
  topOfBookRecordCount: number;
  sequenceValidTopOfBookRecords: number;
  economicallyValidTopOfBookRecords: number;
  parityUsableTopOfBookRecords: number;
  crossedTopOfBookRecords: number;
  insufficientDepthTopOfBookRecords: number;
  awaitingSnapshotTopOfBookRecords: number;
  invalidPriceTopOfBookRecords: number;
  lockedTopOfBookRecords: number;
  malformedJsonlLines: number;
};

export type HealthReportedCounts = {
  topOfBookRecordCount: number | null;
  sequenceValidTopOfBookRecords: number | null;
  economicallyValidTopOfBookRecords: number | null;
  parityUsableTopOfBookRecords: number | null;
  crossedTopOfBookRecords: number | null;
  insufficientDepthTopOfBookRecords: number | null;
  awaitingSnapshotTopOfBookRecords: number | null;
  invalidPriceTopOfBookRecords: number | null;
  captureVerdict: string | null;
};

export type HealthCountMismatch = {
  field: string;
  healthValue: number | null;
  recomputedValue: number;
  delta: number | null;
};

export type EconomicStateMismatch = {
  lineNumber: number;
  marketTicker: string;
  receivedAtLocal: string;
  field: string;
  reportedValue: string | boolean | null;
  recomputedValue: string | boolean;
};

export type TransitionCoverageMetrics = {
  invalidToValidTransitionsObserved: number;
  validToInvalidTransitionsObserved: number;
  transitionsWithEmittedRecord: number;
  medianGapBetweenEconomicallyValidMs: number | null;
  longestGapBetweenEconomicallyValidMs: number | null;
};

export type CaptureRunQualityValidation = {
  runId: string;
  runDir: string;
  skipped: boolean;
  skipReason: string | null;
  formatClassification: CaptureFormatClassification;
  healthReported: HealthReportedCounts;
  recomputed: RecomputedValidityCounts;
  healthMismatches: HealthCountMismatch[];
  economicStateMismatches: EconomicStateMismatch[];
  transitionCoverage: TransitionCoverageMetrics;
  warnings: string[];
  economicallyValidShare: number | null;
  parityUsableShare: number | null;
  sequenceValidShare: number | null;
  enoughForParityResearch: boolean;
};

export type CaptureQualityValidationSummary = {
  runsScanned: number;
  runsValidated: number;
  runsSkipped: number;
  legacyFormatRuns: number;
  economicStateFormatRuns: number;
  mixedFormatRuns: number;
  healthMismatchRuns: number;
  economicStateMismatchRuns: number;
  latestRunId: string | null;
  latestRunEconomicallyValidShare: number | null;
  latestRunParityUsableRecords: number;
  latestRunEnoughForParityResearch: boolean;
  recommendedNextAction: string;
};

export type CaptureQualityValidationReport = {
  generatedAt: string;
  outputPath: string;
  htmlOutputPath: string;
  disclaimer: string;
  caveats: readonly string[];
  config: CaptureQualityValidationConfig;
  summary: CaptureQualityValidationSummary;
  runs: CaptureRunQualityValidation[];
  warnings: string[];
};
