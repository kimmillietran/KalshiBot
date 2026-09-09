import type { CalibrationFadeForwardValidationIo } from "../calibrationFadeForwardValidation/calibrationFadeForwardValidationTypes";
import { V1_FORBIDDEN_OUTPUT_PATHS } from "../calibrationFadeV2ForwardValidation/calibrationFadeV2ForwardValidationTypes";

export const CALIBRATION_FADE_V2_CROSS_RUN_ANALYSIS_VERSION =
  "calibration-fade-v2-cross-run-validation-v1" as const;

export const V2_CROSS_RUN_JSON_ROOT =
  "data/research-results/calibration-fade-v2/cross-run/confirmatory";
export const V2_CROSS_RUN_HTML_ROOT =
  "data/reports/calibration-fade-v2/cross-run/confirmatory";

export const V2_CROSS_RUN_FORBIDDEN_OUTPUT_PATHS = [
  ...V1_FORBIDDEN_OUTPUT_PATHS,
  "data/research-results/calibration-fade-cross-run-markets.jsonl",
  "data/research-results/calibration-fade-cross-run-runs.jsonl",
  "data/research-results/calibration-fade-cross-run-appearances.jsonl",
] as const;

export class CalibrationFadeV2CrossRunValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CalibrationFadeV2CrossRunValidationError";
  }
}

export type CalibrationFadeV2CrossRunValidationIo = CalibrationFadeForwardValidationIo;

export type NormalizedCaptureRun = {
  captureRunDir: string;
  runId: string;
};

export type V2CrossRunPerRunIdentity = {
  runId: string;
  configurationHash: string;
  freezeCommitSha: string;
  evidenceMode: "confirmatory";
  sourceRecordType: string;
  analysisVersion: string;
  confirmatoryReportSha: string;
  confirmatoryMarketsSha: string;
  readinessVerdict: "v2-capture-ready";
};

export type V2CrossRunHashPayload = {
  analysisVersion: typeof CALIBRATION_FADE_V2_CROSS_RUN_ANALYSIS_VERSION;
  evidenceMode: "confirmatory";
  hypothesisId: string;
  hypothesisVersion: "v2";
  configurationHash: string;
  freezeCommitSha: string;
  sourceRecordType: string;
  selectedRunIds: readonly string[];
  perRun: readonly V2CrossRunPerRunIdentity[];
};

export type CalibrationFadeV2CrossRunOutputPaths = {
  outputPath: string;
  htmlOutputPath: string;
  marketsOutputPath: string;
  runsOutputPath: string;
  appearancesOutputPath: string;
};

export type CalibrationFadeV2CrossRunPerRunLedger = {
  runId: string;
  captureRunDir: string;
  evidenceMode: "confirmatory";
  confirmatoryEligibility: true;
  configurationHash: string;
  freezeCommitSha: string;
  sourceRecordType: string;
  analysisVersion: string;
  captureStartedAt: string;
  captureHealthVerdict: string;
  readinessVerdict: "v2-capture-ready";
  candidateEpisodeCount: number;
  candidateMarketCount: number;
  confirmatoryReportSha: string;
  confirmatoryMarketsSha: string;
};

export type CalibrationFadeV2CrossRunAppearanceLedger = {
  runId: string;
  marketTicker: string;
  entryTimestamp: string;
  canonical: boolean;
  suppressed: boolean;
  suppressionReason: string | null;
  conflicting: boolean;
  conflictReasons: readonly string[];
};

export type CalibrationFadeV2CrossRunPerRunSummary = {
  runId: string;
  captureRunDir: string;
  evidenceMode: "confirmatory";
  confirmatoryEligibility: true;
  configurationHash: string;
  freezeCommitSha: string;
  sourceRecordType: string;
  analysisVersion: string;
  captureStartedAt: string;
  captureHealthVerdict: string;
  readinessVerdict: "v2-capture-ready";
  candidateEpisodeCount: number;
  candidateMarketCount: number;
  confirmatoryReportSha: string;
  confirmatoryMarketsSha: string;
  interpretationClassification: string;
  recommendedNextAction: string;
};
