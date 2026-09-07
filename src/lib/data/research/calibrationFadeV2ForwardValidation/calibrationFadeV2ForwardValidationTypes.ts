import type { CalibrationFadeForwardValidationIo } from "../calibrationFadeForwardValidation/calibrationFadeForwardValidationTypes";
import type {
  CalibrationFadeCalibrationMetrics,
  CalibrationFadeExecutableMetrics,
  CalibrationFadeFunnelStage,
  CalibrationFadeGatePassCounts,
  CalibrationFadeInterpretationClassification,
  CalibrationFadeRecommendedNextAction,
  CalibrationFadeSelectedRunQuality,
  CalibrationFadeSettlementCoverage,
  HistoricalHypothesisBenchmark,
} from "../calibrationFadeForwardValidation/calibrationFadeForwardValidationTypes";
import {
  V2_REQUIRED_PROVIDER,
  V2_REQUIRED_PROVIDER_INSTRUMENT,
  V2_REQUIRED_SOURCE_RECORD_TYPE,
} from "../calibrationFadeV2Preregistration";

export const CALIBRATION_FADE_V2_FORWARD_VALIDATION_VERSION =
  "calibration-fade-v2-forward-validation-v1";

export const CALIBRATION_FADE_V2_FORWARD_VALIDATION_DISCLAIMER =
  "Prospective calibration-fade v2 forward validation is offline research only. "
  + "It evaluates the frozen completed-candle volatility contract. "
  + "It does not place orders, fetch live Coinbase candles, optimize thresholds, or emit trade recommendations.";

export const V2_CANDLE_GRANULARITY_MS = 60_000;
export const V2_CANDLE_CLOSE_OFFSET_MS = 59_999;
export const V2_REQUIRED_LOOKBACK_BARS = 10;
export const V2_REQUIRED_CLOSE_COUNT = 11;

export const V2_CANDLE_ARTIFACT_FILENAME = "btc-candles-1m.jsonl";

export const V1_FORBIDDEN_OUTPUT_PATHS = [
  "data/research-results/calibration-fade-forward-validation.json",
  "data/reports/calibration-fade-forward-validation.html",
  "data/research-results/calibration-fade-forward-events.jsonl",
  "data/research-results/calibration-fade-forward-markets.jsonl",
  "data/research-results/calibration-fade-cross-run-validation.json",
  "data/reports/calibration-fade-cross-run-validation.html",
] as const;

export const CALIBRATION_FADE_V2_EVIDENCE_MODES = ["diagnostic", "confirmatory"] as const;
export type CalibrationFadeV2EvidenceMode = (typeof CALIBRATION_FADE_V2_EVIDENCE_MODES)[number];

export const V2_RETRIEVAL_METHODS = [
  "rest-poll",
  "startup-backfill",
  "restart-resync",
  "synthetic-fixture",
] as const;
export type V2RetrievalMethod = (typeof V2_RETRIEVAL_METHODS)[number];

export class CalibrationFadeV2ForwardValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CalibrationFadeV2ForwardValidationError";
  }
}

export type ClosedMinuteObservation = {
  source: string;
  provider: typeof V2_REQUIRED_PROVIDER;
  productId: typeof V2_REQUIRED_PROVIDER_INSTRUMENT;
  sourceRecordType: typeof V2_REQUIRED_SOURCE_RECORD_TYPE;
  granularityMs: typeof V2_CANDLE_GRANULARITY_MS;
  candleOpenTime: string;
  candleCloseTime: string;
  openTimeMs: number;
  closeTimeMs: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number | null;
  observedAtLocal: string;
  firstObservedAtLocal: string;
  observedAtLocalMs: number;
  firstObservedAtLocalMs: number;
  retrievalMethod: V2RetrievalMethod;
  ohlcComplete: true;
  runId: string | null;
  processEpochId: string | null;
};

export type HistoricalReplicaVolatilityRejectionReason =
  | "insufficient-completed-minutes"
  | "timing-identity-conflict"
  | "malformed-ohlc"
  | "missing-observation-timestamp"
  | "in-progress-minute-excluded"
  | "not-yet-observed"
  | "volatility-estimate-unavailable";

export type HistoricalReplicaVolatilityWindow = {
  available: boolean;
  annualizedVolatility: number | null;
  candles: readonly { timestamp: number; open: number; high: number; low: number; close: number }[];
  selectedOpenTimeMs: readonly number[];
  rejectionReason: HistoricalReplicaVolatilityRejectionReason | null;
};

export type CalibrationFadeV2EvidenceIdentity = {
  hypothesisId: string;
  hypothesisVersion: "v2";
  configurationHash: string;
  freezeCommitSha: string;
  sourceRecordType: typeof V2_REQUIRED_SOURCE_RECORD_TYPE;
  sourceContractId: typeof V2_REQUIRED_SOURCE_RECORD_TYPE;
  captureRunId: string;
  captureStartedAt: string;
  evidenceMode: CalibrationFadeV2EvidenceMode;
  confirmatoryEligibility: boolean;
  confirmatoryIneligibilityReason: string | null;
};

export type CalibrationFadeV2ForwardValidationConfig = {
  captureRunDir: string;
  evidenceMode: CalibrationFadeV2EvidenceMode;
  hypothesisConfigPath: string;
  provenancePath: string;
  importsDir: string;
  maximumBtcJoinAgeMs: number;
  candlesPath: string | null;
};

export type CalibrationFadeV2OutputPaths = {
  outputPath: string;
  htmlOutputPath: string;
  eventsOutputPath: string;
  marketsOutputPath: string;
};

export type CalibrationFadeV2ForwardValidationIo = CalibrationFadeForwardValidationIo;

export type CalibrationFadeV2ForwardValidationReport = {
  analysisVersion: typeof CALIBRATION_FADE_V2_FORWARD_VALIDATION_VERSION;
  analysisScope: "selected-run";
  selectedRunId: string;
  selectedRunDirectory: string;
  sourceRunIds: readonly string[];
  hypothesisId: string;
  hypothesisVersion: "v2";
  hypothesisConfigurationHash: string;
  freezeCommitSha: string;
  sourceRecordType: typeof V2_REQUIRED_SOURCE_RECORD_TYPE;
  sourceContractId: typeof V2_REQUIRED_SOURCE_RECORD_TYPE;
  captureRunId: string;
  captureStartedAt: string;
  evidenceMode: CalibrationFadeV2EvidenceMode;
  confirmatoryEligibility: boolean;
  confirmatoryIneligibilityReason: string | null;
  historicalSourceArtifacts: readonly string[];
  artifactGeneratedAt: string;
  outputPath: string;
  htmlOutputPath: string;
  eventsOutputPath: string;
  marketsOutputPath: string;
  recordsScanned: number;
  marketsScanned: number;
  btcSpotRecordsScanned: number;
  candleObservationsScanned: number;
  qualifyingObservationCount: number;
  candidateEpisodeCount: number;
  candidateMarketCount: number;
  executableCandidateCount: number;
  settlementCoverageShare: number | null;
  warnings: readonly string[];
  inputArtifactIdentities: readonly Record<string, unknown>[];
  selectedRunQuality: CalibrationFadeSelectedRunQuality;
  historicalBenchmark: HistoricalHypothesisBenchmark;
  evidenceIdentity: CalibrationFadeV2EvidenceIdentity;
  forwardBenchmark: CalibrationFadeCalibrationMetrics & {
    executable: CalibrationFadeExecutableMetrics;
    settlementCoverage: CalibrationFadeSettlementCoverage;
  };
  funnel: readonly CalibrationFadeFunnelStage[];
  gatePassCounts: CalibrationFadeGatePassCounts;
  volatilityWindowRejections: Record<string, number>;
  featureCompatibility: {
    probabilityMeasureAvailable: boolean;
    volatilityMeasureAvailable: boolean;
    timeRemainingAvailable: boolean;
    incompatibleFeatures: readonly string[];
    spotUsedForVolatility: false;
  };
  summary: {
    interpretationClassification: CalibrationFadeInterpretationClassification;
    recommendedNextAction: CalibrationFadeRecommendedNextAction;
    rationale: string;
  };
  disclaimer: string;
};
