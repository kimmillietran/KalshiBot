export const BID_SIZE_COVERAGE_AUDIT_FILENAME = "bid-size-coverage-audit.json";
export const DEFAULT_BID_SIZE_COVERAGE_AUDIT_OUTPUT_PATH =
  "data/research-results/bid-size-coverage-audit.json";
export const DEFAULT_BID_SIZE_COVERAGE_AUDIT_HTML_PATH =
  "data/reports/bid-size-coverage-audit.html";

export const BID_SIZE_COVERAGE_AUDIT_DISCLAIMER =
  "Depth fidelity audit only. No trading decisions are made. No orders are placed. Findings inform capture quality and bid-only parity research readiness.";

export const BID_SIZE_COVERAGE_AUDIT_CAVEATS = [
  "Raw Kalshi ladders use quantity_fp / delta_fp fractional contract sizes.",
  "M12.7 bid-only parity requires min(yesBidSize, noBidSize) >= 1 contract.",
  "Sub-contract or floating-point dust sizes are not executable depth.",
  "Legacy captures without size fields remain supported with conservative gates.",
] as const;

export const SIZE_MISMATCH_CLASSIFICATIONS = [
  "match",
  "raw-size-missing",
  "replay-size-missing",
  "emit-size-missing",
  "price-match-size-missing",
  "price-mismatch",
  "dust-level-size",
  "fractional-below-parity-min",
  "legacy-record-without-size",
  "unknown",
] as const;

export type SizeMismatchClassification =
  (typeof SIZE_MISMATCH_CLASSIFICATIONS)[number];

export const SIZE_LOSS_CLASSIFICATIONS = [
  "none",
  "floating-point-dust-at-best-bid",
  "parity-min-size-gate",
  "legacy-missing-size-fields",
  "emit-size-missing",
  "raw-size-missing",
  "unknown",
] as const;

export type SizeLossClassification = (typeof SIZE_LOSS_CLASSIFICATIONS)[number];

export const RECOMMENDED_SIZE_FIXES = [
  "no-fix-needed",
  "improve-bid-size-emission",
  "extend-capture-with-size-fields",
  "document-parity-min-size-gate",
  "continue-capture-and-run-downstream-analysis",
  "investigate-low-bid-pair-coverage",
  "run-static-parity-and-lifecycle",
  "unknown",
] as const;

export type RecommendedSizeFix = (typeof RECOMMENDED_SIZE_FIXES)[number];

export const COMPARISON_MODES = ["full", "bounded-sample"] as const;
export type ComparisonMode = (typeof COMPARISON_MODES)[number];

export type BidSizeCoverageAuditConfig = {
  captureRunDir: string;
  marketTicker: string | null;
  maxRawMessages: number;
  sampleLimit: number;
};

export const DEFAULT_BID_SIZE_COVERAGE_AUDIT_CONFIG: BidSizeCoverageAuditConfig = {
  captureRunDir: "data/live-capture/forward-quotes",
  marketTicker: null,
  maxRawMessages: Number.POSITIVE_INFINITY,
  sampleLimit: 25,
};

import type { JsonlIo } from "@/lib/data/research/jsonl";

export type BidSizeCoverageAuditIo = JsonlIo & {
  createLineIterable: (path: string) => AsyncIterable<string>;
};

export type RawLadderSizeInventory = {
  messagesScanned: number;
  malformedLineCount: number;
  snapshotLadderEntries: number;
  deltaUpdates: number;
  snapshotEntriesWithSize: number;
  deltaEntriesWithSize: number;
  yesLadderSizeCoverageShare: number | null;
  noLadderSizeCoverageShare: number | null;
  rawBestBidPricePresentCount: number;
  rawBestBidSizePresentCount: number;
  rawBestBidSizeZeroCount: number;
  rawBestBidSizeNonzeroCount: number;
  rawBestBidSizeBelowParityMinCount: number;
  notes: string[];
};

export type ReplayBidSizeState = {
  replayPointsEmitted: number;
  yesBestBidPricePresentCount: number;
  yesBestBidSizePresentCount: number;
  noBestBidPricePresentCount: number;
  noBestBidSizePresentCount: number;
  bestPriceChangedSizeMissingCount: number;
  samePriceSizeChangedCount: number;
  zeroSizeRemoveLevelCount: number;
  dustLevelBestBidCount: number;
  replayBidSizeCoverageShare: number | null;
};

export type TopOfBookSizeComparisonMetrics = {
  topOfBookRecordsCompared: number;
  sizeMatchCount: number;
  priceMatchSizeMissingCount: number;
  priceMismatchCount: number;
  emitSizeMissingCount: number;
  replaySizeMissingCount: number;
  legacyRecordWithoutSizeCount: number;
  dustLevelSizeCount: number;
  fractionalBelowParityMinCount: number;
  topOfBookBidSizePresentCount: number;
  bidPairWithSizeCount: number;
  bidPairWithoutSizeCount: number;
  topOfBookBidSizeCoverageShare: number | null;
  bidSizeCoverageShare: number | null;
};

export type TopOfBookSizeComparisonSample = {
  marketTicker: string;
  sequence: number;
  receivedAtLocal: string;
  capturedYesBidCents: number | null;
  capturedYesBidSize: number | null;
  replayedYesBidCents: number | null;
  replayedYesBidSize: number | null;
  capturedNoBidCents: number | null;
  capturedNoBidSize: number | null;
  replayedNoBidCents: number | null;
  replayedNoBidSize: number | null;
  classification: SizeMismatchClassification;
  reason: string;
};

export type BidSizeCoverageAuditSummary = {
  captureRunDir: string;
  runId: string | null;
  comparisonMode: ComparisonMode;
  messagesScanned: number;
  topOfBookRecordsCompared: number;
  rawBestBidSizePresentCount: number;
  replayBestBidSizePresentCount: number;
  topOfBookBidSizePresentCount: number;
  bidPairWithSizeCount: number;
  bidPairWithoutSizeCount: number;
  sizeLossClassification: SizeLossClassification;
  recommendedNextFix: RecommendedSizeFix;
  confidence: "high" | "medium" | "low";
};

export type BidSizeCoverageAuditResult = {
  summary: BidSizeCoverageAuditSummary;
  rawInventory: RawLadderSizeInventory;
  replayState: ReplayBidSizeState;
  comparison: TopOfBookSizeComparisonMetrics;
  samples: TopOfBookSizeComparisonSample[];
  warnings: string[];
};

export type BidSizeCoverageAuditReport = BidSizeCoverageAuditResult & {
  generatedAt: string;
  outputPath: string;
  htmlOutputPath: string;
  disclaimer: string;
  caveats: readonly string[];
  config: BidSizeCoverageAuditConfig;
};

export class BidSizeCoverageAuditError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BidSizeCoverageAuditError";
  }
}
