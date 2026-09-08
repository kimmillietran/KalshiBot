import type { CalibrationFadeForwardValidationIo } from "../calibrationFadeForwardValidation/calibrationFadeForwardValidationTypes";
import {
  LIVE_CANDLE_GRANULARITY_MS,
  LIVE_CANDLE_PRODUCT_ID,
  LIVE_CANDLE_PROVIDER,
  LIVE_CANDLE_SOURCE,
  LIVE_CANDLE_SOURCE_RECORD_TYPE,
} from "@/lib/data/live/forwardQuoteCapture/btcCandles1mSidecarTypes";
import { V2_REQUIRED_CLOSE_COUNT } from "../calibrationFadeV2ForwardValidation/calibrationFadeV2ForwardValidationTypes";
import { V2_ADJACENT_SOURCE_GAP_POLICY_NONE } from "../calibrationFadeV2Preregistration";

export const CALIBRATION_FADE_V2_CAPTURE_READINESS_SCHEMA_VERSION = 1 as const;
export const CALIBRATION_FADE_V2_CAPTURE_READINESS_CLASSIFICATION =
  "capture-source-readiness" as const;

export const CALIBRATION_FADE_V2_CAPTURE_READINESS_DISCLAIMER =
  "Calibration-fade v2 exact-run capture readiness is a source/input gate only. "
  + "It does not evaluate the hypothesis, detect high volatility or candidate events, "
  + "measure calibration or PnL, require settlements, or authorize trading. "
  + "v2-capture-ready means the selected run's inputs are trustworthy and "
  + "prospective-boundary eligible enough to invoke the v2 evaluator; it does not "
  + "select evidence mode or interpret results as confirmatory.";

export const V2_CAPTURE_READINESS_VERDICTS = [
  "v2-run-identity-invalid",
  "v2-capture-not-terminal",
  "v2-capture-started-at-unavailable",
  "v2-candle-source-unavailable",
  "v2-candle-identity-invalid",
  "v2-quote-source-unavailable",
  "v2-spot-join-source-unavailable",
  "v2-prospective-boundary-ineligible",
  "v2-capture-diagnostic-only",
  "v2-capture-ready",
] as const;

export type CalibrationFadeV2CaptureReadinessVerdict =
  (typeof V2_CAPTURE_READINESS_VERDICTS)[number];

export const V2_CAPTURE_READINESS_VERDICT_PRECEDENCE: readonly CalibrationFadeV2CaptureReadinessVerdict[] =
  V2_CAPTURE_READINESS_VERDICTS;

export const V2_CAPTURE_READINESS_RECOMMENDED_ACTIONS = [
  "evaluate-exact-run-under-governed-evidence-mode",
  "diagnostic-evaluator-only",
  "repair-producer-or-input-selection-before-evaluation",
] as const;

export type CalibrationFadeV2CaptureReadinessRecommendedAction =
  (typeof V2_CAPTURE_READINESS_RECOMMENDED_ACTIONS)[number];

export const V2_READINESS_REQUIRED_PROVIDER = LIVE_CANDLE_PROVIDER;
export const V2_READINESS_REQUIRED_PRODUCT_ID = LIVE_CANDLE_PRODUCT_ID;
export const V2_READINESS_REQUIRED_SOURCE_RECORD_TYPE = LIVE_CANDLE_SOURCE_RECORD_TYPE;
export const V2_READINESS_REQUIRED_SOURCE = LIVE_CANDLE_SOURCE;
export const V2_READINESS_REQUIRED_GRANULARITY_MS = LIVE_CANDLE_GRANULARITY_MS;
export const V2_READINESS_REQUIRED_CLOSE_COUNT = V2_REQUIRED_CLOSE_COUNT;
export const V2_READINESS_ADJACENT_SOURCE_GAP_POLICY = V2_ADJACENT_SOURCE_GAP_POLICY_NONE;

export const V2_CAPTURE_READINESS_JSON_ROOT = "data/research-results/calibration-fade-v2/readiness";
export const V2_CAPTURE_READINESS_HTML_ROOT = "data/reports/calibration-fade-v2/readiness";
export const V2_CAPTURE_READINESS_JSON_FILENAME = "capture-readiness.json";
export const V2_CAPTURE_READINESS_HTML_FILENAME = "capture-readiness.html";

export class CalibrationFadeV2CaptureReadinessError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CalibrationFadeV2CaptureReadinessError";
  }
}

export type CalibrationFadeV2CaptureReadinessIo = CalibrationFadeForwardValidationIo;

export type CalibrationFadeV2CaptureReadinessConfig = {
  captureRunDir: string;
  hypothesisConfigPath: string;
  provenancePath: string;
};

export type CalibrationFadeV2CaptureReadinessOutputPaths = {
  jsonOutputPath: string;
  htmlOutputPath: string;
};

export type CalibrationFadeV2CaptureReadinessSourceContract = {
  provider: typeof V2_READINESS_REQUIRED_PROVIDER;
  productId: typeof V2_READINESS_REQUIRED_PRODUCT_ID;
  sourceRecordType: typeof V2_READINESS_REQUIRED_SOURCE_RECORD_TYPE;
  source: typeof V2_READINESS_REQUIRED_SOURCE;
  granularityMs: typeof V2_READINESS_REQUIRED_GRANULARITY_MS;
  requiredCloseCount: typeof V2_READINESS_REQUIRED_CLOSE_COUNT;
  adjacentSourceGapPolicy: typeof V2_READINESS_ADJACENT_SOURCE_GAP_POLICY;
  maximumSourceGapMs: null;
  requireBtcJoin: boolean;
};

export type CalibrationFadeV2CaptureReadinessBoundedProbe = {
  artifactPath: string | null;
  artifactPresent: boolean;
  nonblankLineCount: number;
  parseableRecordCount: number;
  stoppedAfterFirstValid: boolean;
};

export type CalibrationFadeV2CaptureReadinessReport = {
  schemaVersion: typeof CALIBRATION_FADE_V2_CAPTURE_READINESS_SCHEMA_VERSION;
  classification: typeof CALIBRATION_FADE_V2_CAPTURE_READINESS_CLASSIFICATION;
  disclaimer: typeof CALIBRATION_FADE_V2_CAPTURE_READINESS_DISCLAIMER;
  generatedAt: string;
  selectedRunId: string;
  captureRunDir: string;
  verdict: CalibrationFadeV2CaptureReadinessVerdict;
  blockingReasons: readonly string[];
  captureStartedAt: string | null;
  captureEndedAt: string | null;
  captureTerminalState: string | null;
  freezeCommitSha: string | null;
  freezeTimestamp: string | null;
  confirmatoryEligibility: boolean;
  candleArtifactPath: string | null;
  candleRecordCount: number;
  distinctValidCompletedMinutes: number;
  candleProcessEpochId: string | null;
  quoteArtifactPath: string | null;
  parseableQuoteRecordCount: number;
  quoteProbe: CalibrationFadeV2CaptureReadinessBoundedProbe;
  spotArtifactPath: string | null;
  parseableSpotRecordCount: number;
  spotProbe: CalibrationFadeV2CaptureReadinessBoundedProbe;
  sourceContract: CalibrationFadeV2CaptureReadinessSourceContract;
  recommendedNextAction: CalibrationFadeV2CaptureReadinessRecommendedAction;
  jsonOutputPath: string;
  htmlOutputPath: string;
};

export type CalibrationFadeV2CaptureReadinessCliSummary = {
  selectedRunId: string;
  verdict: CalibrationFadeV2CaptureReadinessVerdict;
  confirmatoryEligibility: boolean;
  distinctValidCompletedMinutes: number;
  recommendedNextAction: CalibrationFadeV2CaptureReadinessRecommendedAction;
  jsonOutputPath: string;
  htmlOutputPath: string;
};
