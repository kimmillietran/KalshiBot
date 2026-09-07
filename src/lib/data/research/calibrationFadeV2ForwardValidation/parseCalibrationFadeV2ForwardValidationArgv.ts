import {
  DEFAULT_CALIBRATION_FADE_V2_HYPOTHESIS_CONFIG_PATH,
  DEFAULT_CALIBRATION_FADE_V2_PROVENANCE_PATH,
} from "../calibrationFadeV2Preregistration";
import { resolveSelectedRunId } from "../calibrationFadeForwardValidation/calibrationFadeForwardValidationUtils";

import {
  CALIBRATION_FADE_V2_EVIDENCE_MODES,
  CalibrationFadeV2ForwardValidationError,
  type CalibrationFadeV2EvidenceMode,
  type CalibrationFadeV2ForwardValidationConfig,
} from "./calibrationFadeV2ForwardValidationTypes";
import { resolveCalibrationFadeV2OutputPaths } from "./resolveCalibrationFadeV2OutputPaths";

function readFlagValue(argv: readonly string[], flag: string): string | null {
  const index = argv.indexOf(flag);
  if (index === -1) {
    return null;
  }
  const value = argv[index + 1];
  return typeof value === "string" && value.trim().length > 0 && !value.startsWith("--")
    ? value.trim()
    : null;
}

function hasFlag(argv: readonly string[], flag: string): boolean {
  return argv.includes(flag);
}

/** Parses CLI args for the v2 evaluator. Evidence mode is mandatory. */
export function parseCalibrationFadeV2ForwardValidationArgv(argv: readonly string[]): {
  hypothesisId: string | null;
  config: CalibrationFadeV2ForwardValidationConfig;
  outputPath: string;
  htmlOutputPath: string;
  eventsOutputPath: string;
  marketsOutputPath: string;
} {
  if (hasFlag(argv, "--latest") || hasFlag(argv, "--use-latest")) {
    throw new CalibrationFadeV2ForwardValidationError(
      "v2 evaluation does not support latest-run selection",
    );
  }

  const captureRunDir = readFlagValue(argv, "--capture-run-dir");
  if (!captureRunDir) {
    throw new CalibrationFadeV2ForwardValidationError(
      "--capture-run-dir is required; v2 does not fall back to latest capture",
    );
  }
  if (!resolveSelectedRunId(captureRunDir)) {
    throw new CalibrationFadeV2ForwardValidationError(`Invalid capture run directory: ${captureRunDir}`);
  }

  const evidenceModeRaw = readFlagValue(argv, "--evidence-mode");
  if (!evidenceModeRaw) {
    throw new CalibrationFadeV2ForwardValidationError(
      "--evidence-mode is required and must be diagnostic or confirmatory; missing mode fails closed",
    );
  }
  if (!(CALIBRATION_FADE_V2_EVIDENCE_MODES as readonly string[]).includes(evidenceModeRaw)) {
    throw new CalibrationFadeV2ForwardValidationError(
      `--evidence-mode must be diagnostic or confirmatory; received ${JSON.stringify(evidenceModeRaw)}`,
    );
  }
  const evidenceMode = evidenceModeRaw as CalibrationFadeV2EvidenceMode;

  const paths = resolveCalibrationFadeV2OutputPaths({
    evidenceMode,
    captureRunDir,
    outputPath: readFlagValue(argv, "--output"),
    htmlOutputPath: readFlagValue(argv, "--html-output"),
    eventsOutputPath: readFlagValue(argv, "--events-output"),
    marketsOutputPath: readFlagValue(argv, "--markets-output"),
  });

  return {
    hypothesisId: readFlagValue(argv, "--hypothesis-id"),
    outputPath: paths.outputPath,
    htmlOutputPath: paths.htmlOutputPath,
    eventsOutputPath: paths.eventsOutputPath,
    marketsOutputPath: paths.marketsOutputPath,
    config: {
      captureRunDir,
      evidenceMode,
      hypothesisConfigPath:
        readFlagValue(argv, "--hypothesis-config")
        ?? DEFAULT_CALIBRATION_FADE_V2_HYPOTHESIS_CONFIG_PATH,
      provenancePath:
        readFlagValue(argv, "--provenance")
        ?? DEFAULT_CALIBRATION_FADE_V2_PROVENANCE_PATH,
      importsDir: readFlagValue(argv, "--imports-dir") ?? "data/imports",
      maximumBtcJoinAgeMs: Number(readFlagValue(argv, "--maximum-btc-join-age-ms") ?? "5000"),
      candlesPath: readFlagValue(argv, "--candles-path"),
    },
  };
}
