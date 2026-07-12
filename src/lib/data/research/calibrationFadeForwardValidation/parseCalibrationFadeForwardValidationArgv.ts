import {
  CalibrationFadeForwardValidationError,
  DEFAULT_CALIBRATION_FADE_FORWARD_EVENTS_PATH,
  DEFAULT_CALIBRATION_FADE_FORWARD_MARKETS_PATH,
  DEFAULT_CALIBRATION_FADE_FORWARD_VALIDATION_HTML_PATH,
  DEFAULT_CALIBRATION_FADE_FORWARD_VALIDATION_OUTPUT_PATH,
  DEFAULT_CALIBRATION_FADE_HYPOTHESIS_CONFIG_PATH,
  type CalibrationFadeForwardValidationConfig,
} from "./calibrationFadeForwardValidationTypes";
import { resolveSelectedRunId } from "./calibrationFadeForwardValidationUtils";

function readFlagValue(argv: readonly string[], flag: string): string | null {
  const index = argv.indexOf(flag);
  if (index === -1) {
    return null;
  }
  const value = argv[index + 1];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

/** Parses CLI args for calibration-fade forward validation. */
export function parseCalibrationFadeForwardValidationArgv(argv: readonly string[]): {
  outputPath: string;
  htmlOutputPath: string;
  hypothesisId: string | null;
  config: CalibrationFadeForwardValidationConfig;
} {
  const captureRunDir = readFlagValue(argv, "--capture-run-dir");
  if (!captureRunDir) {
    throw new CalibrationFadeForwardValidationError(
      "--capture-run-dir is required; selected-run mode does not fall back to latest capture.",
    );
  }

  if (!resolveSelectedRunId(captureRunDir)) {
    throw new CalibrationFadeForwardValidationError(`Invalid capture run directory: ${captureRunDir}`);
  }

  const hypothesisConfigPath =
    readFlagValue(argv, "--hypothesis-config")
    ?? DEFAULT_CALIBRATION_FADE_HYPOTHESIS_CONFIG_PATH;
  const hypothesisId = readFlagValue(argv, "--hypothesis-id");

  return {
    outputPath: readFlagValue(argv, "--output") ?? DEFAULT_CALIBRATION_FADE_FORWARD_VALIDATION_OUTPUT_PATH,
    htmlOutputPath:
      readFlagValue(argv, "--html-output") ?? DEFAULT_CALIBRATION_FADE_FORWARD_VALIDATION_HTML_PATH,
    hypothesisId,
    config: {
      captureRunDir,
      hypothesisConfigPath,
      importsDir: readFlagValue(argv, "--imports-dir") ?? "data/imports",
      maximumBtcJoinAgeMs: Number(readFlagValue(argv, "--maximum-btc-join-age-ms") ?? "5000"),
      eventsOutputPath:
        readFlagValue(argv, "--events-output") ?? DEFAULT_CALIBRATION_FADE_FORWARD_EVENTS_PATH,
      marketsOutputPath:
        readFlagValue(argv, "--markets-output") ?? DEFAULT_CALIBRATION_FADE_FORWARD_MARKETS_PATH,
    },
  };
}

export {
  DEFAULT_CALIBRATION_FADE_FORWARD_VALIDATION_OUTPUT_PATH,
  DEFAULT_CALIBRATION_FADE_FORWARD_VALIDATION_HTML_PATH,
  DEFAULT_CALIBRATION_FADE_FORWARD_EVENTS_PATH,
  DEFAULT_CALIBRATION_FADE_FORWARD_MARKETS_PATH,
  DEFAULT_CALIBRATION_FADE_HYPOTHESIS_CONFIG_PATH,
};
