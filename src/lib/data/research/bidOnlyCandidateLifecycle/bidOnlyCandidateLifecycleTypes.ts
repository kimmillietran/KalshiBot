export const BID_ONLY_CANDIDATE_LIFECYCLE_FILENAME = "bid-only-candidate-lifecycle.json";
export const DEFAULT_BID_ONLY_CANDIDATE_LIFECYCLE_OUTPUT_PATH =
  "data/research-results/bid-only-candidate-lifecycle.json";
export const DEFAULT_BID_ONLY_CANDIDATE_LIFECYCLE_HTML_PATH =
  "data/reports/bid-only-candidate-lifecycle.html";
export const DEFAULT_BID_ONLY_CANDIDATE_LIFECYCLE_INPUT_DIR =
  "data/live-capture/forward-quotes";
export const DEFAULT_STATIC_PARITY_SCAN_ARTIFACT_PATH =
  "data/research-results/static-parity-scan.json";

export const BID_ONLY_CANDIDATE_LIFECYCLE_DISCLAIMER =
  "Candidate episodes are offline diagnostic windows. They are not trade recommendations. Executable confirmation is required before any actionability claim. No trading decisions are made. No orders are placed.";

export const BID_ONLY_CANDIDATE_LIFECYCLE_CAVEATS = [
  "Episodes group consecutive bid-only parity states; gaps split windows.",
  "Gross bid-book imbalance is a research signal, not guaranteed executable edge.",
  "BTC spot joins are optional and use nearest-timestamp matching.",
  "Time-to-close buckets depend on market-metadata closeTime when present.",
] as const;

export const EPISODE_CLASSIFICATIONS = [
  "no-candidate",
  "too-brief",
  "insufficient-depth",
  "gross-candidate-episode",
  "buffer-adjusted-candidate-episode",
  "persistent-candidate-episode",
  "needs-executable-confirmation",
] as const;

export type EpisodeClassification = (typeof EPISODE_CLASSIFICATIONS)[number];

export const TIME_TO_CLOSE_BUCKETS = [
  "0-1m",
  "1-3m",
  "3-5m",
  "5-10m",
  "10-15m",
  "unknown",
] as const;

export type TimeToCloseBucket = (typeof TIME_TO_CLOSE_BUCKETS)[number];

export const BTC_MOVE_BUCKETS = [
  "flat",
  "small-up",
  "small-down",
  "moderate-up",
  "moderate-down",
  "large-up",
  "large-down",
  "unknown",
] as const;

export type BtcMoveBucket = (typeof BTC_MOVE_BUCKETS)[number];

import type { DownstreamScopeMetadata } from "../downstreamAnalysisScope/downstreamAnalysisScopeTypes";

export type BidOnlyCandidateLifecycleConfig = {
  forwardQuotesDir: string;
  captureRunDir: string | null;
  staticParityScanPath: string | null;
  pricingModel: "bid-only";
  maxGapMs: number;
  minEpisodeDurationMs: number;
  minEdgeCents: number;
  minSizeContracts: number;
  persistentEpisodeDurationMs: number;
  persistentEpisodeMinRecords: number;
  feeBufferCents: number;
  minGrossEdgeCents: number;
  minBidOnlyEdgeCents: number;
  requireExecutableConfirmation: boolean;
};

export type BidOnlyCandidateLifecycleIo = {
  readFile: (path: string) => string;
  fileExists: (path: string) => boolean;
  readdir: (path: string) => readonly string[];
  isDirectory: (path: string) => boolean;
};

export type BidOnlyClassifiedRecord = {
  runId: string;
  marketTicker: string;
  eventTicker: string | null;
  receivedAtLocal: string;
  receivedAtMs: number;
  classification: string;
  classificationFamily: string;
  bidSumCents: number | null;
  bidOnlyEdgeCents: number | null;
  estimatedNetEdgeCents: number | null;
  minBidSizeContracts: number | null;
  requiresExecutableConfirmation: boolean;
  reason: string;
};

export type BidOnlyCandidateEpisode = {
  episodeId: string;
  runId: string;
  marketTicker: string;
  eventTicker: string | null;
  classificationFamily: string;
  episodeClassification: EpisodeClassification;
  startedAt: string;
  endedAt: string;
  durationMs: number;
  recordCount: number;
  maxBidOnlyEdgeCents: number | null;
  meanBidOnlyEdgeCents: number | null;
  medianBidOnlyEdgeCents: number | null;
  p95BidOnlyEdgeCents: number | null;
  minBidSizeContracts: number | null;
  medianBidSizeContracts: number | null;
  maxBidSizeContracts: number | null;
  firstBidSumCents: number | null;
  lastBidSumCents: number | null;
  edgeStabilityScore: number | null;
  sizeStabilityScore: number | null;
  gapCount: number;
  maxGapMs: number | null;
  btcStartPrice: number | null;
  btcEndPrice: number | null;
  btcMoveDuringEpisode: number | null;
  btcMoveBucket: BtcMoveBucket;
  timeToCloseAtStartMs: number | null;
  timeToCloseAtEndMs: number | null;
  timeToCloseBucket: TimeToCloseBucket;
  requiresExecutableConfirmation: boolean;
};

export type BidOnlyCandidateLifecycleMetrics = {
  runsScanned: number;
  marketsScanned: number;
  recordsScanned: number;
  bidOnlyCandidateRecords: number;
  episodesBuilt: number;
  episodesByClassification: Record<EpisodeClassification, number>;
  grossCandidateEpisodes: number;
  bufferAdjustedCandidateEpisodes: number;
  persistentCandidateEpisodes: number;
  maxEpisodeDurationMs: number | null;
  medianEpisodeDurationMs: number | null;
  p95EpisodeDurationMs: number | null;
  maxEdgeCents: number | null;
  medianEdgeCents: number | null;
  p95EdgeCents: number | null;
  totalCandidateTimeMs: number;
  marketsWithRepeatedEpisodes: number;
  timeToCloseBucketDistribution: Record<TimeToCloseBucket, number>;
  btcMoveBucketDistribution: Record<BtcMoveBucket, number>;
  malformedLineCount: number;
  warnings: string[];
};

export type BidOnlyCandidateLifecycleSummary = {
  recommendedNextAction: string;
  enoughForStrategyEvaluation: boolean;
  requiresExecutableConfirmation: boolean;
};

export type BidOnlyCandidateLifecycleReport = {
  generatedAt: string;
  outputPath: string;
  htmlOutputPath: string;
  disclaimer: string;
  caveats: readonly string[];
  config: BidOnlyCandidateLifecycleConfig;
  summary: BidOnlyCandidateLifecycleSummary;
  metrics: BidOnlyCandidateLifecycleMetrics;
  scope: DownstreamScopeMetadata;
  analysisScope: DownstreamScopeMetadata["analysisScope"];
  selectedRunId: string | null;
  sourceRunIds: readonly string[];
  episodes: readonly BidOnlyCandidateEpisode[];
};

export class BidOnlyCandidateLifecycleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BidOnlyCandidateLifecycleError";
  }
}
