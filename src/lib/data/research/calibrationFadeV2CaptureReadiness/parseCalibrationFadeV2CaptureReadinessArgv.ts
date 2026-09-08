import {
  DEFAULT_CALIBRATION_FADE_V2_HYPOTHESIS_CONFIG_PATH,
  DEFAULT_CALIBRATION_FADE_V2_PROVENANCE_PATH,
} from "../calibrationFadeV2Preregistration";
import { resolveSelectedRunId } from "../calibrationFadeForwardValidation/calibrationFadeForwardValidationUtils";

import {
  CalibrationFadeV2CaptureReadinessError,
  type CalibrationFadeV2CaptureReadinessConfig,
  type CalibrationFadeV2CaptureReadinessOutputPaths,
} from "./calibrationFadeV2CaptureReadinessTypes";
import { resolveCalibrationFadeV2CaptureReadinessOutputPaths } from "./resolveCalibrationFadeV2CaptureReadinessOutputPaths";

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

/** Parses CLI args for the v2 exact-run capture readiness gate. Latest selection is rejected. */
export function parseCalibrationFadeV2CaptureReadinessArgv(argv: readonly string[]): {
  config: CalibrationFadeV2CaptureReadinessConfig;
  paths: CalibrationFadeV2CaptureReadinessOutputPaths;
} {
  if (hasFlag(argv, "--latest")) {
    throw new CalibrationFadeV2CaptureReadinessError(
      "v2 capture readiness does not support --latest; pass --capture-run-dir for an exact run",
    );
  }
  if (hasFlag(argv, "--use-latest")) {
    throw new CalibrationFadeV2CaptureReadinessError(
      "v2 capture readiness does not support --use-latest; pass --capture-run-dir for an exact run",
    );
  }

  const captureRunDir = readFlagValue(argv, "--capture-run-dir");
  if (!captureRunDir) {
    throw new CalibrationFadeV2CaptureReadinessError(
      "--capture-run-dir is required; v2 capture readiness does not fall back to latest or mtime",
    );
  }
  if (!resolveSelectedRunId(captureRunDir)) {
    throw new CalibrationFadeV2CaptureReadinessError(`Invalid capture run directory: ${captureRunDir}`);
  }

  return {
    config: {
      captureRunDir,
      hypothesisConfigPath:
        readFlagValue(argv, "--hypothesis-config")
        ?? DEFAULT_CALIBRATION_FADE_V2_HYPOTHESIS_CONFIG_PATH,
      provenancePath:
        readFlagValue(argv, "--provenance")
        ?? DEFAULT_CALIBRATION_FADE_V2_PROVENANCE_PATH,
    },
    paths: resolveCalibrationFadeV2CaptureReadinessOutputPaths({
      captureRunDir,
      jsonOutputPath: readFlagValue(argv, "--output"),
      htmlOutputPath: readFlagValue(argv, "--html-output"),
    }),
  };
}
