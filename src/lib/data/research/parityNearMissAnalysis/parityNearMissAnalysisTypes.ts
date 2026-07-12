import type { JsonlIo } from "@/lib/data/research/jsonl";
import type { StaticParityFrictionConfig } from "@/lib/data/research/staticParityScan/staticParityScanTypes";

import type { IndependentGatePassCounts, SequentialFunnelStage } from "./parityGateSemantics";

export const PARITY_NEAR_MISS_ANALYSIS_FILENAME = "parity-near-miss-analysis.json";
export const DEFAULT_PARITY_NEAR_MISS_ANALYSIS_OUTPUT_PATH =
  "data/research-results/parity-near-miss-analysis.json";
export const DEFAULT_PARITY_NEAR_MISS_ANALYSIS_HTML_PATH =
  "data/reports/parity-near-miss-analysis.html";

export const PARITY_NEAR_MISS_ANALYSIS_DISCLAIMER =
  "Run-scoped parity near-miss analysis is offline diagnostic research only. It does not place orders, perform live trading, optimize thresholds, or emit trade recommendations.";

export const PARITY_NEAR_MISS_DISTANCE_SIGN_CONVENTION =
  "Positive distance = shortfall below the qualification threshold (more cents needed). Zero or negative distance = qualified (meets or exceeds threshold).";

export const PARITY_NEAR_MISS_REJECTION_GATES = [
  "invalid-book",
  "unsynchronized-book",
  "missing-btc-join",
  "missing-executable-size",
  "no-positive-edge",
  "gross-parity-shortfall",
  "buffer-adjusted-shortfall",
  "stale-quote",
  "market-not-open",
  "insufficient-persistence",
] as const;

export type ParityNearMissRejectionGate = (typeof PARITY_NEAR_MISS_REJECTION_GATES)[number];

export const PARITY_NEAR_MISS_DISTANCE_BUCKETS = [
  "qualified",
  "within-0.5-cents",
  "0.5-to-1-cent",
  "1-to-2-cents",
  "2-to-5-cents",
  "5-to-10-cents",
  "more-than-10-cents",
  "unavailable",
] as const;

export type ParityNearMissDistanceBucket = (typeof PARITY_NEAR_MISS_DISTANCE_BUCKETS)[number];

export const PARITY_NEAR_MISS_INTERPRETATION_CLASSIFICATIONS = [
  "no-signal-far-from-threshold",
  "no-signal-with-narrow-near-misses",
  "execution-gates-binding",
  "fees-or-buffer-binding",
  "persistence-gate-binding",
  "observation-quality-inconclusive",
  "candidates-present",
  "insufficient-data",
] as const;

export type ParityNearMissInterpretationClassification =
  (typeof PARITY_NEAR_MISS_INTERPRETATION_CLASSIFICATIONS)[number];

export type ParityNearMissAnalysisConfig = {
  captureRunDir: string;
  nearMissLimit: number;
  stalenessBoundMs: number;
  friction: StaticParityFrictionConfig;
  lifecycle: {
    maxGapMs: number;
    minEpisodeDurationMs: number;
    persistentEpisodeDurationMs: number;
    persistentEpisodeMinRecords: number;
    requireExecutableConfirmation: boolean;
  };
};

export type ParityNearMissAnalysisIo = JsonlIo & {
  isDirectory: (path: string) => boolean;
};

export type ParityNearMissRuleConfiguration = StaticParityFrictionConfig & {
  stalenessBoundMs: number;
  lifecycle: ParityNearMissAnalysisConfig["lifecycle"];
};

export type ParityNearMissObservationMetrics = {
  marketTicker: string;
  timestamp: string;
  receivedAtMs: number;
  timeRemainingMs: number | null;
  yesBidCents: number | null;
  noBidCents: number | null;
  yesBidSize: number | null;
  noBidSize: number | null;
  bidOnlyParityValue: number | null;
  grossDistanceToQualification: number | null;
  feeAdjustedDistanceToQualification: number | null;
  bufferAdjustedDistanceToQualification: number | null;
  executableSize: number | null;
  bookValid: boolean;
  bookSynchronized: boolean;
  marketOpen: boolean | null;
  btcJoinAvailable: boolean;
  quoteAgeMs: number | null;
  quoteAgeStatus: "known" | "unknown" | "negative";
  stalenessPass: boolean | null;
  sizePass: boolean;
  grossParityPass: boolean;
  feePass: boolean;
  bufferPass: boolean;
  persistencePass: boolean | null;
  firstRejectingGate: ParityNearMissRejectionGate | null;
  allRejectingGates: readonly ParityNearMissRejectionGate[];
  integrityCaveat: string | null;
  metricUnavailableReasons: Record<string, string>;
};

export type ParityNearMissRankedEntry = {
  rank: number;
  marketTicker: string;
  timestamp: string;
  timeRemainingMs: number | null;
  yesBidCents: number | null;
  noBidCents: number | null;
  yesBidSize: number | null;
  noBidSize: number | null;
  observedEdgeCents: number | null;
  requiredEdgeCents: number;
  shortfallCents: number;
  distance: number;
  distanceKind: "gross" | "fee-adjusted" | "buffer-adjusted" | "executable";
  bookValid: boolean;
  bookSynchronized: boolean;
  quoteAgeMs: number | null;
  firstRejectingGate: ParityNearMissRejectionGate | null;
  allRejectingGates: readonly ParityNearMissRejectionGate[];
  integrityCaveat: string | null;
};

export type ParityNearMissEpisodeRankedEntry = {
  rank: number;
  episodeId: string;
  marketTicker: string;
  startedAt: string;
  endedAt: string;
  durationMs: number;
  recordCount: number;
  maxBidOnlyEdgeCents: number | null;
  distance: number;
  distanceKind: "gross" | "buffer-adjusted";
  firstRejectingGate: ParityNearMissRejectionGate;
  episodeClassification: string;
};

export type ParityNearMissSequentialQualificationFunnel = Record<SequentialFunnelStage, number>;

/** @deprecated Use sequentialQualificationFunnel; retained for JSON compatibility. */
export type ParityNearMissQualificationFunnel = {
  recordsLoaded: number;
  recordsEligible: number;
  validBooks: number;
  synchronizedBooks: number;
  sizedBidPairs: number;
  positiveEdgeRecords: number;
  grossPass: number;
  feePass: number;
  bufferPass: number;
  stalenessPass: number;
  persistentPass: number;
  finalCandidates: number;
};

export type ParityNearMissGateCounts = {
  firstRejectionByGate: Record<ParityNearMissRejectionGate, number>;
  allRejectionsByGate: Record<ParityNearMissRejectionGate, number>;
  episodesReachingStage: Record<string, number>;
};

export type ParityNearMissStalenessSummary = {
  stalenessThresholdMs: number;
  knownFreshCount: number;
  knownStaleCount: number;
  unknownQuoteAgeCount: number;
  negativeQuoteAgeCount: number;
};

export type ParityNearMissSelectedRunQuality = {
  selectedRunId: string;
  runDurationSeconds: number | null;
  validBookShare: number | null;
  btcJoinCoverageShare: number | null;
  bidSizeCoverageShare: number | null;
  reconnectCount: number | null;
  suspectedSystemSleepSeconds: number | null;
  sequenceGapCount: number | null;
  captureVerdict: string | null;
  reconciliationVerdict: string | null;
};

export type ParityNearMissInputArtifactIdentities = {
  captureHealthPath: string | null;
  captureHealthRunId: string | null;
  captureHealthAuditPath: string | null;
  captureHealthReconciliationPath: string | null;
  bidSizeCoverageAuditPath: string | null;
};

export type ParityNearMissAnalysisSummary = {
  interpretationClassification: ParityNearMissInterpretationClassification;
  recommendedNextAction: string;
  classificationRationale: string;
  closestGrossNearMissCents: number | null;
  closestFeeAdjustedNearMissCents: number | null;
  closestBufferNearMissCents: number | null;
  candidateCount: number;
  grossNearMissCount: number;
  feeAdjustedNearMissCount: number;
  bufferNearMissCount: number;
};

export type ParityNearMissAnalysisReport = {
  generatedAt: string;
  outputPath: string;
  htmlOutputPath: string;
  disclaimer: string;
  distanceSignConvention: string;
  analysisScope: "selected-run";
  selectedRunId: string;
  selectedRunDirectory: string;
  sourceRunIds: readonly string[];
  recordsScanned: number;
  recordsEligible: number;
  episodesBuilt: number;
  artifactGeneratedAt: string;
  ruleConfiguration: ParityNearMissRuleConfiguration;
  ruleConfigurationHash: string;
  inputArtifactIdentities: ParityNearMissInputArtifactIdentities;
  selectedRunQuality: ParityNearMissSelectedRunQuality;
  independentGatePassCounts: IndependentGatePassCounts;
  sequentialQualificationFunnel: ParityNearMissSequentialQualificationFunnel;
  /** @deprecated Alias mapped from sequentialQualificationFunnel for compatibility. */
  qualificationFunnel: ParityNearMissQualificationFunnel;
  gateCounts: ParityNearMissGateCounts;
  stalenessSummary: ParityNearMissStalenessSummary;
  distanceDistributions: {
    gross: Record<ParityNearMissDistanceBucket, number>;
    feeAdjusted: Record<ParityNearMissDistanceBucket, number>;
    bufferAdjusted: Record<ParityNearMissDistanceBucket, number>;
    bidSumRelationship: Record<string, number>;
    executableSize: Record<string, number>;
    timeRemaining: Record<string, number>;
    quoteAge: Record<string, number>;
    persistenceLength: Record<string, number>;
  };
  nearMissRankings: {
    gross: readonly ParityNearMissRankedEntry[];
    feeAdjusted: readonly ParityNearMissRankedEntry[];
    bufferAdjusted: readonly ParityNearMissRankedEntry[];
    executable: readonly ParityNearMissRankedEntry[];
    grossEpisodes: readonly ParityNearMissEpisodeRankedEntry[];
    bufferEpisodes: readonly ParityNearMissEpisodeRankedEntry[];
  };
  perMarketBreakdown: Record<
    string,
    {
      recordsScanned: number;
      grossPass: number;
      bufferPass: number;
      closestGrossNearMissCents: number | null;
    }
  >;
  timeRemainingBreakdown: Record<string, number>;
  summary: ParityNearMissAnalysisSummary;
  warnings: string[];
};

export class ParityNearMissAnalysisError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ParityNearMissAnalysisError";
  }
}
