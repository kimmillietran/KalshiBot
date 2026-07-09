export const VENDOR_ORDERBOOK_SUFFICIENCY_AUDIT_FILENAME =
  "vendor-orderbook-sufficiency-audit.json";
export const DEFAULT_VENDOR_ORDERBOOK_SUFFICIENCY_AUDIT_OUTPUT_PATH =
  "data/research-results/vendor-orderbook-sufficiency-audit.json";
export const DEFAULT_VENDOR_ORDERBOOK_SUFFICIENCY_AUDIT_HTML_OUTPUT_PATH =
  "data/reports/vendor-orderbook-sufficiency-audit.html";
export const DEFAULT_VENDOR_ORDERBOOK_AUDIT_CONFIG_PATH =
  "data/vendor-orderbook-samples/vendor-orderbook-audit-config.json";
export const DEFAULT_VENDOR_ORDERBOOK_SAMPLES_ROOT =
  "data/vendor-orderbook-samples";

export const VendorOrderbookSufficiencyAuditErrorCode = {
  INVALID_JSON: "invalid-json",
  INVALID_DOCUMENT: "invalid-document",
  MISSING_CONFIG: "missing-config",
} as const;

export type VendorOrderbookSufficiencyAuditErrorCode =
  (typeof VendorOrderbookSufficiencyAuditErrorCode)[keyof typeof VendorOrderbookSufficiencyAuditErrorCode];

export class VendorOrderbookSufficiencyAuditError extends Error {
  readonly code: VendorOrderbookSufficiencyAuditErrorCode;

  constructor(message: string, code: VendorOrderbookSufficiencyAuditErrorCode) {
    super(message);
    this.name = "VendorOrderbookSufficiencyAuditError";
    this.code = code;
  }
}

export const VENDOR_SAMPLE_STATUSES = [
  "missing-samples",
  "present",
  "unsupported-sample-schema",
  "parse-error",
] as const;

export type VendorSampleStatus = (typeof VENDOR_SAMPLE_STATUSES)[number];

export const VENDOR_SUFFICIENCY_VERDICTS = [
  "sufficient",
  "promising-needs-more-sample",
  "insufficient-sparse-snapshots",
  "insufficient-no-sizes",
  "insufficient-zero-spread",
  "insufficient-no-kxbtc15m",
  "insufficient-no-kxbtcd",
  "product-blocked-no-ladder",
  "unknown-no-sample",
] as const;

export type VendorSufficiencyVerdict = (typeof VENDOR_SUFFICIENCY_VERDICTS)[number];

export const OVERALL_AUDIT_VERDICTS = [
  "request-vendor-samples",
  "vendor-data-sufficient-for-backfill",
  "vendor-data-promising-needs-overlap-validation",
  "vendor-data-insufficient",
  "vendor-data-unknown",
] as const;

export type OverallAuditVerdict = (typeof OVERALL_AUDIT_VERDICTS)[number];

export const VENDOR_AUDIT_RECOMMENDED_NEXT_ACTIONS = [
  "request-vendor-samples",
  "build-vendor-backfill-importer-spike",
  "build-overlap-validation",
  "use-vendor-only-for-exploration",
  "do-not-use-vendor-data",
  "continue-own-forward-capture",
] as const;

export type VendorAuditRecommendedNextAction =
  (typeof VENDOR_AUDIT_RECOMMENDED_NEXT_ACTIONS)[number];

export type VendorCoverageStatus = "verified" | "claimed" | "unknown" | "not-covered";

export type VendorOrderbookSourceMetadata = {
  vendorId: string;
  displayName: string;
  claimedHistoricalOrderbook: boolean | "unknown";
  claimedEarliestOrderbookDate: string | null;
  claimedTimestampResolution: "ms" | "seconds" | "unknown";
  claimedSemantics: "event-driven" | "periodic-snapshot" | "reconstructed" | "unknown";
  claimedDepth: "full-depth" | "top-of-book" | "unknown";
  claimedSizeFields: boolean | "unknown";
  claimedYesBook: boolean | "unknown";
  claimedNoBook: boolean | "unknown";
  claimedAskFields: boolean | "unknown";
  claimedTradeData: boolean | "unknown";
  claimedApiAccess: boolean | "unknown";
  claimedExportFormats: readonly string[];
  kxbtc15mCoverageStatus: VendorCoverageStatus;
  kxbtcdCoverageStatus: VendorCoverageStatus;
  notes: readonly string[];
};

export type VendorSampleAudit = {
  vendorId: string;
  sampleStatus: VendorSampleStatus;
  sampleFileCount: number;
  rowCount: number;
  marketTickers: readonly string[];
  seriesTickers: readonly string[];
  eventTickers: readonly string[];
  earliestTimestamp: string | null;
  latestTimestamp: string | null;
  timestampResolution: "ms" | "seconds" | "unknown";
  medianSnapshotGapMs: number | null;
  p90SnapshotGapMs: number | null;
  maxSnapshotGapMs: number | null;
  hasYesBids: boolean;
  hasYesAsks: boolean;
  hasNoBids: boolean;
  hasNoAsks: boolean;
  hasSizes: boolean;
  hasTrades: boolean;
  hasMarketMetadata: boolean;
  hasFloorStrike: boolean;
  hasEventTicker: boolean;
  hasSequenceOrUpdateId: boolean;
  hasExchangeTimestamp: boolean;
  hasVendorReceiveTimestamp: boolean;
  nonZeroSpreadShare: number | null;
  zeroSpreadShare: number | null;
  distinctMarkets: number;
  distinctEvents: number;
  eventsWith2PlusStrikes: number;
  eventsWith3PlusStrikes: number;
  maxStrikesPerEvent: number;
  schemaNotes: readonly string[];
};

export type VendorSufficiencyAssessment = {
  kxbtc15mLeadLag: VendorSufficiencyVerdict;
  kxbtc15mParity: VendorSufficiencyVerdict;
  kxbtc15mLadder: VendorSufficiencyVerdict;
  kxbtcdLadder: VendorSufficiencyVerdict;
};

export type VendorAuditEntry = {
  vendorId: string;
  displayName: string;
  metadata: VendorOrderbookSourceMetadata;
  sampleAudit: VendorSampleAudit | null;
  sufficiency: VendorSufficiencyAssessment;
  recommendation: string;
  unknowns: readonly string[];
  blockers: readonly string[];
};

export type VendorSampleRequest = {
  subject: string;
  body: string;
};

export type VendorOrderbookAuditThresholds = {
  medianSnapshotGapMsMax: number;
  p90SnapshotGapMsMax: number;
  nonZeroSpreadShareMin: number;
  minDistinctMarkets: number;
};

export type VendorOrderbookAuditConfig = {
  samplesRoot: string;
  vendorSampleDirs: Readonly<Record<string, string>>;
  thresholds: VendorOrderbookAuditThresholds;
};

export type VendorOrderbookSufficiencyAuditInputPaths = {
  configPath: string;
  samplesRoot: string;
};

export type VendorOrderbookSufficiencyAuditSummary = {
  vendorCount: number;
  vendorsWithSamples: number;
  vendorsWithKxbtc15mVerified: number;
  vendorsWithKxbtcdVerified: number;
  overallVerdict: OverallAuditVerdict;
  recommendedNextAction: VendorAuditRecommendedNextAction;
};

export type VendorOrderbookSufficiencyAuditReport = {
  generatedAt: string;
  outputPath: string;
  htmlOutputPath: string;
  disclaimer: string;
  caveats: readonly string[];
  config: VendorOrderbookAuditConfig;
  inputPaths: VendorOrderbookSufficiencyAuditInputPaths;
  summary: VendorOrderbookSufficiencyAuditSummary;
  vendors: readonly VendorAuditEntry[];
  vendorSampleRequest: VendorSampleRequest;
  warnings: readonly string[];
};

export type VendorOrderbookSufficiencyAuditIo = {
  readFile: (path: string) => string;
  fileExists: (path: string) => boolean;
  readdir: (path: string) => readonly string[];
  isDirectory: (path: string) => boolean;
};
