import type { JsonlIo } from "@/lib/data/research/jsonl";

export const CAPTURE_HEALTH_AUDIT_FILENAME = "capture-health-audit.json";
export const DEFAULT_CAPTURE_HEALTH_AUDIT_OUTPUT_PATH =
  "data/research-results/capture-health-audit.json";
export const DEFAULT_CAPTURE_HEALTH_AUDIT_HTML_OUTPUT_PATH =
  "data/reports/capture-health-audit.html";

export const CaptureHealthAuditErrorCode = {
  MISSING_CAPTURE_DIR: "missing-capture-dir",
  INVALID_JSON: "invalid-json",
  INVALID_CAPTURE_DIR: "invalid-capture-dir",
} as const;

export type CaptureHealthAuditErrorCode =
  (typeof CaptureHealthAuditErrorCode)[keyof typeof CaptureHealthAuditErrorCode];

export class CaptureHealthAuditError extends Error {
  readonly code: CaptureHealthAuditErrorCode;

  constructor(message: string, code: CaptureHealthAuditErrorCode) {
    super(message);
    this.name = "CaptureHealthAuditError";
    this.code = code;
  }
}

export const CAPTURE_READINESS_VERDICTS = [
  "capture-empty",
  "capture-invalid",
  "capture-too-short",
  "capture-gappy",
  "capture-no-btc-spot",
  "capture-zero-spread-suspicious",
  "capture-research-ready",
] as const;

export type CaptureReadinessVerdict =
  (typeof CAPTURE_READINESS_VERDICTS)[number];

export const CAPTURE_READINESS_NEXT_ACTIONS = [
  "rerun-forward-capture",
  "extend-capture-duration",
  "fix-capture-gaps",
  "enable-or-fix-btc-spot-capture",
  "investigate-zero-spread-quotes",
  "proceed-offline-microstructure-research",
  "inspect-capture-artifacts",
] as const;

export type CaptureReadinessNextAction =
  (typeof CAPTURE_READINESS_NEXT_ACTIONS)[number];

export type CaptureHealthAuditThresholds = {
  minDurationSeconds: number;
  maxP90TopOfBookGapMs: number;
  minValidBookShare: number;
  minBtcJoinCoverageShare: number;
  maxZeroSpreadShare: number;
  btcJoinMaxDistanceMs: number;
};

export type CaptureHealthAuditConfig = {
  thresholds: CaptureHealthAuditThresholds;
};

export type CaptureArtifactPaths = {
  captureRunDir: string;
  rawMessagesPath: string | null;
  topOfBookPath: string | null;
  btcSpotPath: string | null;
  marketMetadataPath: string | null;
  captureHealthPath: string | null;
};

export type ParsedTopOfBookRecord = {
  lineNumber: number;
  runId: string | null;
  marketTicker: string;
  eventTicker: string | null;
  seriesTicker: string | null;
  receivedAtLocal: string;
  receivedAtMs: number;
  exchangeTimestampMs: number | null;
  sequence: number | null;
  bookState: string;
  yesBestBidCents: number | null;
  yesBestAskCents: number | null;
  yesBestBidSize?: number | null;
  yesBestAskSize?: number | null;
  noBestBidCents?: number | null;
  noBestAskCents?: number | null;
  noBestBidSize?: number | null;
  noBestAskSize?: number | null;
  yesSpreadCents: number | null;
  noSpreadCents: number | null;
  isEconomicallyValid?: boolean;
  isParityUsable?: boolean;
  economicBookState?: string;
  hourBucket: string;
};

export type ParsedBtcSpotRecord = {
  receivedAtLocal: string;
  receivedAtMs: number;
  exchangeTimestampMs: number | null;
  priceUsd: number;
};

export type ParsedMarketMetadataRecord = {
  marketTicker: string;
  eventTicker: string | null;
};

export type CaptureHealthAuditIo = JsonlIo & {
  isDirectory: (path: string) => boolean;
  fileMtimeMs?: (path: string) => number | null;
};

export type CaptureContinuityMetrics = {
  medianTopOfBookGapMs: number | null;
  p90TopOfBookGapMs: number | null;
  maxTopOfBookGapMs: number | null;
};

export type CaptureSpreadMetrics = {
  nonZeroSpreadShare: number | null;
  zeroSpreadShare: number | null;
  crossedOrInvertedBookCount: number;
  missingBidOrAskShare: number | null;
};

export type CaptureBookStateMetrics = {
  validBookShare: number | null;
  gapDetectedShare: number | null;
  sequenceGapCount: number | null;
  outOfOrderCount: number | null;
  reconnectCount: number | null;
};

export type CaptureBtcJoinMetrics = {
  btcSpotRequested: boolean;
  btcSpotRecordCount: number;
  joinCoverageShare: number | null;
  medianKalshiToBtcDistanceMs: number | null;
  p90KalshiToBtcDistanceMs: number | null;
};

export type CaptureSegmentBreakdown = {
  marketTicker: Record<string, CaptureSegmentMetrics>;
  eventTicker: Record<string, CaptureSegmentMetrics>;
  hour: Record<string, CaptureSegmentMetrics>;
  bookState: Record<string, CaptureSegmentMetrics>;
};

export type CaptureSegmentMetrics = {
  recordCount: number;
  validBookShare: number | null;
  zeroSpreadShare: number | null;
  medianGapMs: number | null;
};

export type CaptureHealthAuditSummary = {
  verdict: CaptureReadinessVerdict;
  recommendedNextAction: CaptureReadinessNextAction;
  runDurationSeconds: number | null;
  rawMessageCount: number;
  topOfBookCount: number;
  btcSpotCount: number;
  marketsCovered: number;
  eventTickersCovered: number;
  firstTimestamp: string | null;
  lastTimestamp: string | null;
  continuity: CaptureContinuityMetrics;
  bookState: CaptureBookStateMetrics;
  spread: CaptureSpreadMetrics;
  btcJoin: CaptureBtcJoinMetrics;
};

export type CaptureHealthAuditReport = {
  generatedAt: string;
  outputPath: string;
  htmlOutputPath: string;
  disclaimer: string;
  caveats: readonly string[];
  warnings: readonly string[];
  captureRunDir: string;
  selectedRunId: string;
  sourceRunIds: readonly string[];
  analysisVersion: string;
  inputArtifactIdentities: readonly {
    path: string;
    role: string;
    sizeBytes: number | null;
    mtimeMs: number | null;
    recordCount: number | null;
  }[];
  recordsScanned: number;
  artifacts: CaptureArtifactPaths;
  config: CaptureHealthAuditConfig;
  summary: CaptureHealthAuditSummary;
  segments: CaptureSegmentBreakdown;
};
