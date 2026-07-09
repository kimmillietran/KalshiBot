export const VENDOR_SAMPLE_INTAKE_FILENAME = "vendor-sample-intake.json";
export const DEFAULT_VENDOR_SAMPLE_INTAKE_OUTPUT_PATH =
  "data/research-results/vendor-sample-intake.json";
export const DEFAULT_VENDOR_SAMPLE_INTAKE_HTML_PATH =
  "data/reports/vendor-sample-intake.html";
export const DEFAULT_VENDOR_SAMPLE_INTAKE_ROOT = "data/vendor-orderbook-samples";
export const DEFAULT_VENDOR_SAMPLE_PREVIEW_LIMIT = 5;

export const VENDOR_INTAKE_VENDOR_IDS = [
  "predexon",
  "dome",
  "allium",
  "lychee",
  "synthesis",
] as const;

export type VendorIntakeVendorId = (typeof VENDOR_INTAKE_VENDOR_IDS)[number];

export const VENDOR_INTAKE_STATUSES = [
  "missing-folder",
  "no-files",
  "unsupported-file-type",
  "unsupported-schema",
  "parse-error",
  "sample-usable",
  "sample-promising",
] as const;

export type VendorIntakeStatus = (typeof VENDOR_INTAKE_STATUSES)[number];

export const VENDOR_INTAKE_OVERALL_VERDICTS = [
  "no-samples",
  "samples-present-not-usable",
  "samples-usable-run-vendor-audit",
  "samples-promising",
] as const;

export type VendorIntakeOverallVerdict = (typeof VENDOR_INTAKE_OVERALL_VERDICTS)[number];

export const VENDOR_INTAKE_RECOMMENDED_ACTIONS = [
  "request-vendor-samples",
  "fix-sample-format",
  "rerun-vendor-orderbook-audit",
  "build-vendor-backfill-importer-spike",
  "continue-own-forward-capture",
] as const;

export type VendorIntakeRecommendedAction =
  (typeof VENDOR_INTAKE_RECOMMENDED_ACTIONS)[number];

export type VendorOrderbookSamplePreview = {
  vendorId: string;
  sourceFile: string;
  rowIndex: number;
  marketTicker: string | null;
  eventTicker: string | null;
  seriesTicker: string | null;
  floorStrike: number | null;
  timestamp: string | null;
  timestampKind: "exchange" | "vendor-receive" | "unknown";
  yesBids: Array<{ priceCents: number; size: number }> | null;
  yesAsks: Array<{ priceCents: number; size: number }> | null;
  noBids: Array<{ priceCents: number; size: number }> | null;
  noAsks: Array<{ priceCents: number; size: number }> | null;
  raw: unknown;
};

export type VendorDetectedFile = {
  filePath: string;
  fileName: string;
  extension: string;
  format: "json" | "jsonl" | "csv" | "parquet" | "unsupported";
  rowCount: number;
  parseError: string | null;
};

export type VendorSchemaDetection = {
  timestampFields: readonly string[];
  marketTickerFields: readonly string[];
  seriesFields: readonly string[];
  eventFields: readonly string[];
  strikeFields: readonly string[];
  yesBidFields: readonly string[];
  yesAskFields: readonly string[];
  noBidFields: readonly string[];
  noAskFields: readonly string[];
  sizeFields: readonly string[];
  tradeFields: readonly string[];
  sequenceFields: readonly string[];
  exchangeTimestampFields: readonly string[];
  vendorReceiveTimestampFields: readonly string[];
  snapshotVsDeltaHint: "snapshot" | "delta" | "mixed" | "unknown";
};

export type VendorFieldAvailability = {
  hasTimestamp: boolean;
  hasMarketTicker: boolean;
  hasSeriesTicker: boolean;
  hasEventTicker: boolean;
  hasFloorStrike: boolean;
  hasYesBidAsk: boolean;
  hasNoBidAsk: boolean;
  hasSizes: boolean;
  hasTrades: boolean;
  hasSequenceOrUpdate: boolean;
  hasExchangeTimestamp: boolean;
  hasVendorReceiveTimestamp: boolean;
};

export type VendorIntakeEntry = {
  vendorId: VendorIntakeVendorId;
  folderPath: string;
  status: VendorIntakeStatus;
  files: readonly VendorDetectedFile[];
  schemaDetection: VendorSchemaDetection | null;
  fieldAvailability: VendorFieldAvailability | null;
  previewRecords: readonly VendorOrderbookSamplePreview[];
  warnings: readonly string[];
  diagnosticExamples: readonly string[];
};

export type VendorSampleIntakeReAuditReadiness = {
  canRunM12_1A: boolean;
  vendorsWithSamples: number;
  m12_1AOverallVerdict: string | null;
  m12_1ARecommendedAction: string | null;
  notes: readonly string[];
};

export type VendorSampleIntakeSummary = {
  vendorFolderCount: number;
  vendorsWithFiles: number;
  vendorsUsable: number;
  vendorsPromising: number;
  totalFilesDetected: number;
  totalPreviewRecords: number;
  overallVerdict: VendorIntakeOverallVerdict;
  recommendedAction: VendorIntakeRecommendedAction;
};

export type VendorSampleIntakeReport = {
  generatedAt: string;
  outputPath: string;
  htmlOutputPath: string;
  samplesRoot: string;
  previewLimit: number;
  summary: VendorSampleIntakeSummary;
  vendors: readonly VendorIntakeEntry[];
  reAuditReadiness: VendorSampleIntakeReAuditReadiness;
  nextSteps: readonly string[];
  warnings: readonly string[];
};

export type VendorSampleIntakeIo = {
  readFile: (path: string) => string;
  fileExists: (path: string) => boolean;
  readdir: (path: string) => readonly string[];
  isDirectory: (path: string) => boolean;
};

export type BuildVendorSampleIntakeReportInput = {
  generatedAt: string;
  outputPath: string;
  htmlOutputPath: string;
  samplesRoot: string;
  previewLimit?: number;
  io: VendorSampleIntakeIo;
};

export class VendorSampleIntakeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VendorSampleIntakeError";
  }
}
