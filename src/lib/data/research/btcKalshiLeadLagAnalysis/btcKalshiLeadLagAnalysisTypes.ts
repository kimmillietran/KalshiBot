import type { JsonlIo } from "../jsonl";

export const BTC_KALSHI_LEAD_LAG_ANALYSIS_VERSION = "btc-kalshi-lead-lag-v1";

export const DEFAULT_BTC_KALSHI_LEAD_LAG_ANALYSIS_OUTPUT_PATH =
  "data/research-results/btc-kalshi-lead-lag-analysis.json";
export const DEFAULT_BTC_KALSHI_LEAD_LAG_ANALYSIS_HTML_PATH =
  "data/reports/btc-kalshi-lead-lag-analysis.html";
export const DEFAULT_BTC_KALSHI_LEAD_LAG_EVENTS_PATH =
  "data/research-results/btc-kalshi-lead-lag-events.jsonl";

export const BTC_KALSHI_LEAD_LAG_DISCLAIMER =
  "BTC-to-Kalshi lead-lag analysis is offline diagnostic research only. It does not place orders, perform live trading, optimize thresholds, or emit trade recommendations.";

export const BTC_RETURN_HORIZONS_MS = [5_000, 15_000, 30_000, 60_000] as const;
export const RESPONSE_WINDOWS_MS = [0, 1_000, 2_000, 5_000, 10_000, 15_000, 30_000, 60_000] as const;

export const BTC_MAGNITUDE_BINS = [
  "less-than-5-bps",
  "5-to-10-bps",
  "10-to-20-bps",
  "20-to-40-bps",
  "40-bps-or-greater",
] as const;

export const TIME_REMAINING_BINS = [
  "0-to-1-minute",
  "1-to-3-minutes",
  "3-to-5-minutes",
  "5-to-10-minutes",
  "10-to-15-minutes",
] as const;

export const IMPLIED_PROBABILITY_BINS = [
  "0-to-10-percent",
  "10-to-30-percent",
  "30-to-50-percent",
  "50-to-70-percent",
  "70-to-90-percent",
  "90-to-100-percent",
] as const;

export type BtcReturnHorizonMs = (typeof BTC_RETURN_HORIZONS_MS)[number];
export type ResponseWindowMs = (typeof RESPONSE_WINDOWS_MS)[number];
export type BtcMagnitudeBin = (typeof BTC_MAGNITUDE_BINS)[number];
export type TimeRemainingBin = (typeof TIME_REMAINING_BINS)[number];
export type ImpliedProbabilityBin = (typeof IMPLIED_PROBABILITY_BINS)[number];

export type BtcDirection = "up" | "down" | "flat";
export type KalshiDirection = "up" | "down" | "flat" | "unavailable";
export type ComparisonDirection = "above-threshold";
export type LagResponseState =
  | "no-observable-kalshi-response"
  | "sub-1-cent-response"
  | "1-cent-or-greater-response"
  | "directionally-wrong-response"
  | "directionally-correct-response"
  | "book-invalid"
  | "book-unsynchronized"
  | "quote-stale"
  | "response-unavailable";

export type LeadLagInterpretationClassification =
  | "insufficient-data"
  | "observation-quality-inconclusive"
  | "no-directional-response"
  | "weak-or-inconsistent-response"
  | "measurable-lead-lag-response"
  | "strong-lead-lag-candidate"
  | "threshold-crossing-only-response";

export type LeadLagRecommendedNextAction =
  | "collect-additional-clean-captures"
  | "fix-observation-integrity"
  | "deprioritize-btc-lead-lag-family"
  | "continue-frozen-characterization"
  | "build-frozen-lead-lag-entry-rule"
  | "build-executable-lead-lag-candidate-dataset"
  | "separate-threshold-crossing-hypothesis";

export class BtcKalshiLeadLagAnalysisError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BtcKalshiLeadLagAnalysisError";
  }
}

export type BtcKalshiLeadLagAnalysisConfig = {
  captureRunDir: string;
  maximumBtcJoinAgeMs: number;
  responseMatchToleranceMs: number;
  triggerCooldownMs: number;
  stalenessBoundMs: number;
  minimumTriggersForClassification: number;
  minimumEligibleTriggersForStrongClassification: number;
  eventsOutputPath: string;
};

export type BtcKalshiLeadLagAnalysisIo = JsonlIo & {
  readFile: (path: string) => string;
  fileExists: (path: string) => boolean;
  isDirectory: (path: string) => boolean;
  writeFile: (path: string, data: string) => void;
  appendFile: (path: string, data: string) => void;
  mkdirSync: (path: string, options?: { recursive?: boolean }) => void;
  unlinkFile: (path: string) => void;
  renameFile: (from: string, to: string) => void;
};

export type BtcKalshiLeadLagInputArtifactIdentities = {
  captureHealthPath: string;
  topOfBookPath: string;
  btcSpotPath: string;
  marketMetadataPath: string;
  captureHealthAuditPath: string | null;
  captureHealthReconciliationPath: string | null;
  bidSizeCoverageAuditPath: string | null;
};

export type BtcKalshiLeadLagSelectedRunQuality = {
  selectedRunId: string;
  runDurationSeconds: number | null;
  validBookShare: number | null;
  btcJoinCoverageShare: number | null;
  bidSizeCoverageShare: number | null;
  reconnectCount: number | null;
  sequenceGapCount: number | null;
  suspectedSystemSleepSeconds: number | null;
  captureVerdict: string | null;
  reconciliationVerdict: string | null;
};

export type MarketContractSemantics = {
  marketTicker: string;
  seriesTicker: string | null;
  eventTicker: string | null;
  closeTimeMs: number | null;
  floorStrikeUsd: number | null;
  comparisonDirection: ComparisonDirection | null;
  contractInterpretationSource: string | null;
  exclusionReason: string | null;
};

export type QuoteSnapshot = {
  timestampMs: number;
  receivedAtLocal: string;
  yesBidCents: number | null;
  yesAskCents: number | null;
  noBidCents: number | null;
  noAskCents: number | null;
  yesMidCents: number | null;
  noMidCents: number | null;
  spreadCents: number | null;
  executableBuyYesCents: number | null;
  executableSellYesCents: number | null;
  bestDisplayedSize: number | null;
  bookValid: boolean;
  bookSynchronized: boolean;
  quoteAgeMs: number | null;
  sequence: number | null;
};

export type BtcReturnFeatures = {
  horizonMs: BtcReturnHorizonMs;
  btcReturnBps: number;
  absoluteBtcReturnBps: number;
  btcDirection: BtcDirection;
  btcStartPrice: number;
  btcEndPrice: number;
  actualHorizonMs: number;
  sampleCount: number;
  maximumInternalSampleGapMs: number;
};

export type ForwardResponseObservation = {
  responseWindowMs: ResponseWindowMs;
  targetResponseTimeMs: number;
  actualMatchedResponseTimeMs: number | null;
  responseMatchErrorMs: number | null;
  yesBidChangeCents: number | null;
  yesAskChangeCents: number | null;
  yesMidChangeCents: number | null;
  noBidChangeCents: number | null;
  noAskChangeCents: number | null;
  spreadChangeCents: number | null;
  sizeChange: number | null;
  bookValid: boolean | null;
  bookSynchronized: boolean | null;
  quoteAgeMs: number | null;
  marketStillOpen: boolean;
  timeRemainingMs: number | null;
  expectedKalshiDirection: KalshiDirection;
  actualKalshiDirection: KalshiDirection;
  directionallyCorrect: boolean | null;
  signedYesBidResponseCents: number | null;
  signedYesAskResponseCents: number | null;
  signedYesMidResponseCents: number | null;
  absoluteResponseCents: number | null;
  responseLatencyMs: number | null;
  noResponseWithinWindow: boolean;
  responseReversal: boolean;
  maximumAdverseResponseCents: number | null;
  maximumFavorableResponseCents: number | null;
  lagResponseState: LagResponseState;
};

export type LeadLagEventRecord = {
  eventId: string;
  selectedRunId: string;
  marketTicker: string;
  triggerTimestamp: string;
  triggerTimestampMs: number;
  btcMoveHorizonMs: BtcReturnHorizonMs;
  btcReturnBps: number;
  btcMagnitudeBin: BtcMagnitudeBin;
  btcDirection: BtcDirection;
  btcPriceAtTrigger: number;
  marketThresholdUsd: number | null;
  distanceFromThresholdBps: number | null;
  btcAboveThreshold: boolean | null;
  thresholdCrossingDuringWindow: boolean;
  timeRemainingMs: number | null;
  timeRemainingBin: TimeRemainingBin | null;
  impliedProbabilityBin: ImpliedProbabilityBin | null;
  yesBidAtTrigger: number | null;
  yesAskAtTrigger: number | null;
  yesMidAtTrigger: number | null;
  spreadAtTrigger: number | null;
  sizeAtTrigger: number | null;
  bookValidAtTrigger: boolean;
  bookSynchronizedAtTrigger: boolean;
  quoteAgeMsAtTrigger: number | null;
  btcSampleAgeMs: number | null;
  contractDirectionResolved: boolean;
  responses: readonly ForwardResponseObservation[];
  dataQualityCaveats: readonly string[];
};

export type LeadLagAggregateBucket = {
  triggerCount: number;
  eligibleTriggerCount: number;
  directionalResponseShare: number | null;
  medianSignedYesMidResponseCents: number | null;
  meanSignedYesMidResponseCents: number | null;
  responseQuantiles: {
    p25: number | null;
    p50: number | null;
    p75: number | null;
  };
  medianTimeToFirst1CentResponseMs: number | null;
  medianTimeToFirst2CentResponseMs: number | null;
  shareNo1CentResponseBy2Seconds: number | null;
  shareNo1CentResponseBy5Seconds: number | null;
  shareNo1CentResponseBy10Seconds: number | null;
  meanSpreadBeforeCents: number | null;
  meanSpreadAfterCents: number | null;
  meanSizeBefore: number | null;
  meanSizeAfter: number | null;
};

export type BtcKalshiLeadLagAnalysisSummary = {
  interpretationClassification: LeadLagInterpretationClassification;
  recommendedNextAction: LeadLagRecommendedNextAction;
  classificationRationale: string;
  triggerCount: number;
  eligibleTriggerCount: number;
  excludedTriggerCount: number;
  thresholdCrossingEventShare: number | null;
  nonThresholdCrossingEventShare: number | null;
};

export type BtcKalshiLeadLagAnalysisReport = {
  generatedAt: string;
  outputPath: string;
  htmlOutputPath: string;
  eventsOutputPath: string;
  disclaimer: string;
  analysisScope: "selected-run";
  selectedRunId: string;
  selectedRunDirectory: string;
  sourceRunIds: readonly string[];
  artifactGeneratedAt: string;
  analysisVersion: string;
  configuration: BtcKalshiLeadLagAnalysisConfig;
  configurationHash: string;
  recordsScanned: number;
  btcRecordsScanned: number;
  marketCount: number;
  triggerCount: number;
  eligibleTriggerCount: number;
  excludedTriggerCount: number;
  warnings: readonly string[];
  inputArtifactIdentities: BtcKalshiLeadLagInputArtifactIdentities;
  selectedRunQuality: BtcKalshiLeadLagSelectedRunQuality;
  causalJoinQuality: {
    btcJoinDirection: "backward-only";
    maximumBtcJoinAgeMs: number;
    unjoinedObservationCount: number;
    staleJoinCount: number;
    btcSampleAgeMsDistribution: Record<string, number>;
    futureLeakageGuardStatus: "pass";
  };
  marketCoverage: {
    marketsWithDirectionalSemantics: number;
    marketsExcludedFromDirectionalAnalysis: number;
    marketsWithThresholdMetadata: number;
    exclusionReasons: Record<string, number>;
  };
  btcMoveDistribution: Record<string, number>;
  triggerCountsByHorizon: Record<string, number>;
  triggerCountsByMagnitudeBin: Record<string, number>;
  suppressedOverlappingTriggerCount: number;
  responseByLagWindow: Record<string, LeadLagAggregateBucket>;
  responseByMagnitudeBin: Record<string, LeadLagAggregateBucket>;
  responseByTimeRemainingBin: Record<string, LeadLagAggregateBucket>;
  responseByImpliedProbabilityBin: Record<string, LeadLagAggregateBucket>;
  responseByThresholdCrossing: {
    thresholdCrossing: LeadLagAggregateBucket;
    nonThresholdCrossing: LeadLagAggregateBucket;
  };
  summary: BtcKalshiLeadLagAnalysisSummary;
};
