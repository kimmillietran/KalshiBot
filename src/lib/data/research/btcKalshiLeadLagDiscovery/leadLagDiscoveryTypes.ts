import type { BtcKalshiLeadLagAnalysisIo } from "../btcKalshiLeadLagAnalysis/btcKalshiLeadLagAnalysisTypes";
import {
  BTC_MAGNITUDE_BINS,
  BTC_RETURN_HORIZONS_MS,
  IMPLIED_PROBABILITY_BINS,
  RESPONSE_WINDOWS_MS,
  TIME_REMAINING_BINS,
} from "../btcKalshiLeadLagAnalysis/btcKalshiLeadLagAnalysisTypes";

export const LEAD_LAG_RESEARCH_SPLIT_VERSION = "lead-lag-research-split-v1" as const;
export const LEAD_LAG_GOVERNED_DISCOVERY_ANALYSIS_VERSION =
  "m12.8a-btc-kalshi-lead-lag-governed-discovery-v1" as const;
export const LEAD_LAG_DISCOVERY_RANKING_VERSION =
  "m12.8a-lead-lag-discovery-ranking-v1" as const;

export const DEFAULT_LEAD_LAG_DISCOVERY_JSON_ROOT =
  "data/research-results/btc-kalshi-lead-lag/discovery";
export const DEFAULT_LEAD_LAG_DISCOVERY_HTML_ROOT =
  "data/reports/btc-kalshi-lead-lag/discovery";
export const LEAD_LAG_DISCOVERY_JSON_FILENAME = "lead-lag-governed-discovery.json";
export const LEAD_LAG_DISCOVERY_HTML_FILENAME = "lead-lag-governed-discovery.html";
export const LEAD_LAG_DISCOVERY_CELLS_FILENAME = "lead-lag-discovery-cells.jsonl";
export const LEAD_LAG_DISCOVERY_SPLIT_FILENAME = "lead-lag-research-split.json";
export const LEAD_LAG_DISCOVERY_TRAIN_ANALYSIS_FILENAME =
  "train-selected-run-lead-lag-analysis.json";
export const LEAD_LAG_DISCOVERY_TRAIN_EVENTS_FILENAME = "train-lead-lag-events.jsonl";

export const LEAD_LAG_DISCOVERY_DISCLAIMER =
  "M12.8a governed BTC/Kalshi lead-lag discovery is train-only exploratory research. "
  + "It does not analyze validation/holdout outcomes, promote candidates, freeze hypotheses, "
  + "create preregistration eligibility, or start capture. All listed captures remain "
  + "exploratory-design-data-not-confirmatory (confirmatoryReuseForbidden=true).";

/** Structural grid product: 4 × 8 × 5 × 5 × 6 = 4800. */
export const LEAD_LAG_STRUCTURAL_CELL_COUNT =
  BTC_RETURN_HORIZONS_MS.length
  * RESPONSE_WINDOWS_MS.length
  * BTC_MAGNITUDE_BINS.length
  * TIME_REMAINING_BINS.length
  * IMPLIED_PROBABILITY_BINS.length;

export const LEAD_LAG_RESPONSE_DIRECTIONS = ["follow-btc", "reverse-btc"] as const;
export type LeadLagResponseDirection = (typeof LEAD_LAG_RESPONSE_DIRECTIONS)[number];

/** Hypotheses examined = structural cells × declared directions. */
export const LEAD_LAG_DISCOVERY_HYPOTHESIS_COUNT =
  LEAD_LAG_STRUCTURAL_CELL_COUNT * LEAD_LAG_RESPONSE_DIRECTIONS.length;

export type LeadLagSplitRole = "train" | "validation" | "holdout";

export type LeadLagContaminationClassification =
  | "clean-for-lead-lag-discovery-role"
  | "previously-inspected"
  | "not-established";

export type LeadLagDiscoveryStatus =
  | "candidates-shortlisted"
  | "no-promising-candidate";

export type LeadLagDiscoveryIsolationStatus =
  | "train-only-discovery"
  | "discovery-saw-full-corpus"
  | "not-proven";

export class LeadLagGovernedDiscoveryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LeadLagGovernedDiscoveryError";
  }
}

export type LeadLagDiscoveryIo = BtcKalshiLeadLagAnalysisIo & {
  /** Optional byte length for identity fingerprints without reading multi-GB bodies. */
  fileByteLength?: (path: string) => number;
};

export type LeadLagCaptureArtifactIdentity = {
  runId: string;
  captureRunDir: string;
  role: LeadLagSplitRole;
  exploratoryRole: "exploratory-design-data-not-confirmatory";
  confirmatoryReuseForbidden: true;
  contaminationClassification: LeadLagContaminationClassification;
  contaminationEvidence: readonly string[];
  captureHealthContentHash: string | null;
  captureHealthAuditContentHash: string | null;
  captureRunStatusContentHash: string | null;
  nativeCaptureVerdict: string | null;
  researchAuditVerdict: string | null;
  durationHours: number | null;
  topOfBookByteLength: number | null;
  btcSpotByteLength: number | null;
  /** Full content hash of btc-spot.jsonl when present and reasonably sized; else partial. */
  btcSpotIdentityHash: string | null;
  /** Size + edge-byte fingerprint for multi-GB top-of-book without full scan. */
  topOfBookIdentityHash: string | null;
  identityHash: string;
};

export type LeadLagResearchSplitManifest = {
  splitVersion: typeof LEAD_LAG_RESEARCH_SPLIT_VERSION;
  createdForAnalysisVersion: typeof LEAD_LAG_GOVERNED_DISCOVERY_ANALYSIS_VERSION;
  confirmatoryReuseForbidden: true;
  train: LeadLagCaptureArtifactIdentity;
  validation: LeadLagCaptureArtifactIdentity;
  holdout: LeadLagCaptureArtifactIdentity;
  splitManifestHash: string;
  warnings: readonly string[];
};

export type LeadLagDiscoveryRankingConfig = {
  rankingVersion: typeof LEAD_LAG_DISCOVERY_RANKING_VERSION;
  maxShortlistSize: number;
  minEligibleMarketTriggers: number;
  minIndependentMarkets: number;
  minIndependentMarketDays: number;
  minAbsMedianMidResponseCents: number;
  minExecutableObservabilityShare: number;
  requireDeclaredDirection: true;
};

export const DEFAULT_LEAD_LAG_DISCOVERY_RANKING_CONFIG: LeadLagDiscoveryRankingConfig = {
  rankingVersion: LEAD_LAG_DISCOVERY_RANKING_VERSION,
  maxShortlistSize: 5,
  minEligibleMarketTriggers: 15,
  minIndependentMarkets: 3,
  minIndependentMarketDays: 1,
  minAbsMedianMidResponseCents: 0.5,
  minExecutableObservabilityShare: 0.05,
  requireDeclaredDirection: true,
};

export type LeadLagSearchUniverseDeclaration = {
  btcReturnHorizonsMs: readonly number[];
  responseWindowsMs: readonly number[];
  magnitudeBins: readonly string[];
  timeRemainingBins: readonly string[];
  impliedProbabilityBins: readonly string[];
  responseDirections: readonly LeadLagResponseDirection[];
  structuralCellCount: number;
  hypothesisCount: number;
  multiplicityDeclaration: string;
};

export type LeadLagDiscoveryCellMetrics = {
  cellId: string;
  hypothesisId: string;
  btcMoveHorizonMs: number;
  responseWindowMs: number;
  btcMagnitudeBin: string;
  timeRemainingBin: string;
  impliedProbabilityBin: string;
  direction: LeadLagResponseDirection;
  eligibleMarketTriggerCount: number;
  uniqueBtcTriggerCount: number;
  independentMarketCount: number;
  independentMarketDayCount: number;
  medianSignedMidResponseCents: number | null;
  meanSignedMidResponseCents: number | null;
  directionalResponseShare: number | null;
  medianSignedExecutableAskResponseCents: number | null;
  executableObservabilityShare: number | null;
  /** Midpoint characterization is distinct from executable economic edge. */
  midpointResponseDistinctFromExecutable: true;
};

export type LeadLagDiscoveryCandidate = LeadLagDiscoveryCellMetrics & {
  rank: number;
  rankingScore: number;
  rankingReasons: readonly string[];
};

export type LeadLagDiscoveryIncidence = {
  trainCaptureHours: number | null;
  recordsScanned: number;
  btcRecordsScanned: number;
  btcTriggerCount: number;
  btcTriggersPerHour: number | null;
  eligibleMarketTriggerCount: number;
  eligibleMarketTriggersPerHour: number | null;
  uniqueMarketCount: number;
  uniqueMarketsPerHour: number | null;
  independentMarketDayCount: number;
  suppressedOverlappingTriggerCount: number;
  dependenceNotes: readonly string[];
};

export type LeadLagGovernedDiscoveryReport = {
  generatedAt: string;
  analysisVersion: typeof LEAD_LAG_GOVERNED_DISCOVERY_ANALYSIS_VERSION;
  disclaimer: typeof LEAD_LAG_DISCOVERY_DISCLAIMER;
  discoveryIsolationStatus: LeadLagDiscoveryIsolationStatus;
  discoveryIsolation: {
    status: LeadLagDiscoveryIsolationStatus;
    reason: string;
  };
  confirmatoryReuseForbidden: true;
  discoveryStatus: LeadLagDiscoveryStatus;
  discoveryIdentityHash: string;
  splitManifestHash: string;
  splitManifest: LeadLagResearchSplitManifest;
  trainArtifactIdentities: LeadLagCaptureArtifactIdentity;
  searchUniverse: LeadLagSearchUniverseDeclaration;
  rankingConfig: LeadLagDiscoveryRankingConfig;
  leadLagAnalysisConfigurationHash: string;
  trainCaptureHealth: {
    selectedRunId: string;
    nativeCaptureVerdict: string | null;
    researchAuditVerdict: string | null;
    validBookShare: number | null;
    btcJoinCoverageShare: number | null;
    bidSizeCoverageShare: number | null;
    runDurationSeconds: number | null;
    reconnectCount: number | null;
    sequenceGapCount: number | null;
    captureHealthSource: string;
  };
  incidence: LeadLagDiscoveryIncidence;
  evaluatedCellCount: number;
  retainedLosingCellCount: number;
  candidates: readonly LeadLagDiscoveryCandidate[];
  candidateRankingMethodology: readonly string[];
  multiplicityDeclaration: string;
  quarantine: {
    validationOutcomesAnalyzed: false;
    holdoutOutcomesAnalyzed: false;
    promotionArtifactCreated: false;
    preregistrationArtifactCreated: false;
    frozenHypothesisCreated: false;
    captureStarted: false;
  };
  outputPaths: {
    outputPath: string;
    htmlOutputPath: string;
    cellsOutputPath: string;
    splitManifestPath: string;
    trainAnalysisOutputPath: string;
    trainEventsOutputPath: string;
  };
  warnings: readonly string[];
};
