import type { JsonlIo } from "@/lib/data/research/jsonl";

export const CALIBRATION_FADE_FORWARD_VALIDATION_VERSION =
  "calibration-fade-forward-validation-v1";

export const DEFAULT_CALIBRATION_FADE_FORWARD_VALIDATION_OUTPUT_PATH =
  "data/research-results/calibration-fade-forward-validation.json";
export const DEFAULT_CALIBRATION_FADE_FORWARD_VALIDATION_HTML_PATH =
  "data/reports/calibration-fade-forward-validation.html";
export const DEFAULT_CALIBRATION_FADE_FORWARD_EVENTS_PATH =
  "data/research-results/calibration-fade-forward-events.jsonl";
export const DEFAULT_CALIBRATION_FADE_FORWARD_MARKETS_PATH =
  "data/research-results/calibration-fade-forward-markets.jsonl";
export const DEFAULT_CALIBRATION_FADE_HYPOTHESIS_CONFIG_PATH =
  "config/research/hypotheses/high-volatility-late-market-calibration-fade-v1.json";

export const CALIBRATION_FADE_FORWARD_VALIDATION_DISCLAIMER =
  "Frozen calibration-fade forward validation is offline research only. It does not place orders, optimize thresholds, scan parameters, or emit trade recommendations.";

export const CALIBRATION_FADE_INTERPRETATION_CLASSIFICATIONS = [
  "hypothesis-provenance-unavailable",
  "forward-feature-incompatible",
  "insufficient-forward-events",
  "settlement-coverage-incomplete",
  "observation-quality-inconclusive",
  "forward-rejects-hypothesis",
  "forward-inconclusive",
  "forward-supports-calibration-effect",
  "forward-supports-executable-fade",
  "forward-contradicts-executability",
] as const;

export type CalibrationFadeInterpretationClassification =
  (typeof CALIBRATION_FADE_INTERPRETATION_CLASSIFICATIONS)[number];

export const CALIBRATION_FADE_RECOMMENDED_ACTIONS = [
  "repair-historical-hypothesis-provenance",
  "build-causal-feature-equivalence-audit",
  "collect-additional-clean-forward-captures",
  "backfill-and-rejoin-settlements",
  "fix-forward-observation-integrity",
  "deprioritize-calibration-fade-family",
  "continue-frozen-forward-validation",
  "build-executable-calibration-fade-candidate-dataset",
  "build-paper-execution-harness",
  "retain-calibration-research-but-deprioritize-trading-rule",
] as const;

export type CalibrationFadeRecommendedNextAction =
  (typeof CALIBRATION_FADE_RECOMMENDED_ACTIONS)[number];

export class CalibrationFadeForwardValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CalibrationFadeForwardValidationError";
  }
}

export type FrozenHypothesisSpec = {
  hypothesisId: string;
  hypothesisVersion: string;
  description: string;
  canonicalSourceArtifacts: readonly string[];
  sourceCandidateId: string;
  axisGroupId: string;
  bucketId: string;
  calibrationDirection: "over" | "under";
  targetOutcomeSide: "yes" | "no";
  suggestedStrategyFamily: string;
  eligibilityRules: {
    volatility: { bucketId: string; minInclusive: number; maxExclusive: number | null };
    probability: { bucketId: string; minInclusive: number; maxExclusive: number };
    timeRemainingMs: { bucketId: string; minInclusive: number; maxExclusive: number };
  };
  probabilityMeasure: { id: string; definition: string; formula: string };
  volatilityDefinition: {
    sourceInstrument: string;
    returnIntervalMs: number;
    lookbackBars: number;
    method: string;
    causalOnly: boolean;
    maximumSourceGapMs: number;
  };
  marketEligibilityRules: {
    requireValidBook: boolean;
    requireSynchronizedBook: boolean;
    requireOpenMarket: boolean;
    requireBtcJoin: boolean;
  };
  deduplicationPolicy: {
    episodeBreakOnDisqualification: boolean;
    entryRule: string;
    primaryValidationUnit: string;
    suppressRepeatedQualifyingSnapshots: boolean;
  };
  entryPriceMeasures: {
    calibrationLayer: string;
    executableLayer: string;
    diagnosticLayer: string;
  };
  settlementMapping: Record<string, string | number>;
  minimumEvidenceRequirements: {
    minimumIndependentCandidateMarkets: number;
    minimumSettlementCoverageShare: number;
    minimumValidBookShare: number;
    minimumBtcJoinCoverageShare: number;
    materialRejectionCalibrationGap: number;
    materialSupportCalibrationGap: number;
    materialExecutableNetReturnCents: number;
  };
  classificationRules: { precedence: readonly CalibrationFadeInterpretationClassification[] };
  configurationHash: string;
};

export type HistoricalHypothesisBenchmark = {
  discoveryObservationCount: number | null;
  discoveryUniqueTradingDays: number | null;
  discoveryCalibrationError: number | null;
  discoveryAverageImpliedProbability: number | null;
  discoveryRealizedFrequency: number | null;
  discoveryRobustnessScore: number | null;
  discoveryPassesValidation: boolean | null;
  sourceArtifactPaths: readonly string[];
  sourceArtifactHashes: Record<string, string>;
  caveats: readonly string[];
};

export type CalibrationFadeForwardValidationConfig = {
  captureRunDir: string;
  hypothesisConfigPath: string;
  importsDir: string;
  maximumBtcJoinAgeMs: number;
  eventsOutputPath: string;
  marketsOutputPath: string;
};

export type CalibrationFadeForwardValidationIo = JsonlIo & {
  readFile: (path: string) => string;
  fileExists: (path: string) => boolean;
  isDirectory: (path: string) => boolean;
  readdir?: (path: string) => readonly string[];
  writeFile: (path: string, data: string) => void;
  appendFile: (path: string, data: string) => void;
  mkdirSync: (path: string, options?: { recursive?: boolean }) => void;
  unlinkFile: (path: string) => void;
  renameFile: (from: string, to: string) => void;
};

export type CalibrationFadeSelectedRunQuality = {
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

export type CalibrationFadeFunnelStage = {
  stageId: string;
  label: string;
  count: number;
};

export type CalibrationFadeGatePassCounts = {
  validBook: number;
  synchronizedBook: number;
  btcJoinAvailable: number;
  volatilityAvailable: number;
  highVolatility: number;
  probabilityBand: number;
  timeRemainingBand: number;
  qualifyingObservation: number;
};

export type CalibrationFadeEventRecord = {
  eventType: "qualifying-observation" | "episode-entry" | "market-entry";
  marketTicker: string;
  episodeId: string;
  timestamp: string;
  impliedYesProbability: number;
  annualizedVolatility: number | null;
  timeRemainingMs: number | null;
  noAskCents: number | null;
  yesMidCents: number | null;
  bookValid: boolean;
  bookSynchronized: boolean;
};

export type CalibrationFadeMarketRecord = {
  marketTicker: string;
  entryTimestamp: string;
  impliedYesProbability: number;
  noAskCents: number | null;
  executableAvailable: boolean;
  settlementStatus: string;
  settledOutcome: "yes" | "no" | "unknown";
  grossReturnCents: number | null;
  feeAdjustedReturnCents: number | null;
  calibrationGapSigned: number | null;
};

export type CalibrationFadeCalibrationMetrics = {
  qualifyingObservationCount: number;
  candidateEpisodeCount: number;
  candidateMarketCount: number;
  meanImpliedYesProbability: number | null;
  meanTargetSideProbability: number | null;
  observedYesSettlementRate: number | null;
  observedTargetSideSettlementRate: number | null;
  calibrationGap: number | null;
  signedCalibrationGap: number | null;
  brierScore: number | null;
  logLoss: number | null;
  marketLevelSignedCalibrationGap: number | null;
  descriptiveObservationSignedGap: number | null;
};

export type CalibrationFadeExecutableMetrics = {
  executableCandidateCount: number;
  unavailableExecutablePriceCount: number;
  grossReturnCents: number | null;
  feeAdjustedReturnCents: number | null;
  winRate: number | null;
  averageEntryPriceCents: number | null;
  medianEntryPriceCents: number | null;
  maximumDrawdownCents: number | null;
  cumulativeReturnCents: number | null;
};

export type CalibrationFadeSettlementCoverage = {
  candidateMarketCount: number;
  settledCandidateMarketCount: number;
  joinedCandidateMarketCount: number;
  unresolvedCandidateMarketCount: number;
  settlementCoverageShare: number | null;
  excludedByReason: Record<string, number>;
};

export type CalibrationFadeForwardValidationReport = {
  analysisVersion: string;
  analysisScope: "selected-run";
  selectedRunId: string;
  selectedRunDirectory: string;
  sourceRunIds: readonly string[];
  hypothesisId: string;
  hypothesisVersion: string;
  hypothesisConfigurationHash: string;
  historicalSourceArtifacts: readonly string[];
  historicalSourceHashes: Record<string, string>;
  artifactGeneratedAt: string;
  outputPath: string;
  htmlOutputPath: string;
  eventsOutputPath: string;
  marketsOutputPath: string;
  recordsScanned: number;
  marketsScanned: number;
  btcRecordsScanned: number;
  qualifyingObservationCount: number;
  candidateEpisodeCount: number;
  candidateMarketCount: number;
  executableCandidateCount: number;
  settlementCoverageShare: number | null;
  warnings: readonly string[];
  inputArtifactIdentities: readonly Record<string, unknown>[];
  selectedRunQuality: CalibrationFadeSelectedRunQuality;
  historicalBenchmark: HistoricalHypothesisBenchmark;
  forwardBenchmark: CalibrationFadeCalibrationMetrics & {
    executable: CalibrationFadeExecutableMetrics;
    settlementCoverage: CalibrationFadeSettlementCoverage;
  };
  funnel: readonly CalibrationFadeFunnelStage[];
  gatePassCounts: CalibrationFadeGatePassCounts;
  featureCompatibility: {
    probabilityMeasureAvailable: boolean;
    volatilityMeasureAvailable: boolean;
    timeRemainingAvailable: boolean;
    incompatibleFeatures: readonly string[];
  };
  summary: {
    interpretationClassification: CalibrationFadeInterpretationClassification;
    recommendedNextAction: CalibrationFadeRecommendedNextAction;
    rationale: string;
  };
  disclaimer: string;
};
