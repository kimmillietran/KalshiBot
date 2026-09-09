import {
  DEFAULT_CALIBRATION_FADE_V2_HYPOTHESIS_CONFIG_PATH,
  DEFAULT_CALIBRATION_FADE_V2_PROVENANCE_PATH,
} from "../calibrationFadeV2Preregistration";

import { CalibrationFadeV2CrossRunValidationError } from "./calibrationFadeV2CrossRunValidationTypes";
import { identifyUniqueCaptureRuns, type NormalizedCaptureRun } from "./normalizeCaptureRunDirs";

const KNOWN_FLAGS = new Set([
  "--capture-run-dir",
  "--evidence-mode",
  "--imports-dir",
  "--hypothesis-config",
  "--hypothesis-id",
  "--provenance",
  "--output",
  "--html-output",
  "--markets-output",
  "--runs-output",
  "--appearances-output",
]);

export type CalibrationFadeV2CrossRunCliConfig = {
  captureRuns: readonly NormalizedCaptureRun[];
  evidenceMode: "confirmatory";
  importsDir: string | null;
  hypothesisConfigPath: string;
  provenancePath: string;
  hypothesisId: string | null;
  outputPath: string | null;
  htmlOutputPath: string | null;
  marketsOutputPath: string | null;
  runsOutputPath: string | null;
  appearancesOutputPath: string | null;
};

function readAllFlagValues(argv: readonly string[], flag: string): string[] {
  const values: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] !== flag) {
      continue;
    }
    const value = argv[index + 1];
    if (typeof value !== "string" || value.trim().length === 0 || value.startsWith("--")) {
      throw new CalibrationFadeV2CrossRunValidationError(`${flag} requires a value`);
    }
    values.push(value.trim());
  }
  return values;
}

function readFlagValue(argv: readonly string[], flag: string): string | null {
  const values = readAllFlagValues(argv, flag);
  if (values.length > 1) {
    throw new CalibrationFadeV2CrossRunValidationError(`${flag} may be specified at most once`);
  }
  return values[0] ?? null;
}

export function parseCalibrationFadeV2CrossRunValidationArgv(
  argv: readonly string[],
): CalibrationFadeV2CrossRunCliConfig {
  const unknown = argv.filter((token) => token.startsWith("--") && !KNOWN_FLAGS.has(token));
  if (unknown.length > 0) {
    throw new CalibrationFadeV2CrossRunValidationError(
      `Unknown CLI flag: ${unknown[0]}. v2 cross-run does not discover or fall back to latest captures.`,
    );
  }
  if (argv.includes("--latest") || argv.includes("--use-latest")) {
    throw new CalibrationFadeV2CrossRunValidationError(
      "v2 cross-run does not support latest-run selection",
    );
  }

  const captureRunDirs = readAllFlagValues(argv, "--capture-run-dir");
  if (captureRunDirs.length < 2) {
    throw new CalibrationFadeV2CrossRunValidationError(
      "v2 cross-run requires at least two explicit --capture-run-dir arguments",
    );
  }

  const evidenceMode = readFlagValue(argv, "--evidence-mode");
  if (!evidenceMode) {
    throw new CalibrationFadeV2CrossRunValidationError(
      "--evidence-mode is required and must be confirmatory; missing mode fails closed",
    );
  }
  if (evidenceMode !== "confirmatory") {
    throw new CalibrationFadeV2CrossRunValidationError(
      `--evidence-mode must be confirmatory; received ${JSON.stringify(evidenceMode)}`,
    );
  }

  return {
    captureRuns: identifyUniqueCaptureRuns(captureRunDirs),
    evidenceMode: "confirmatory",
    importsDir: readFlagValue(argv, "--imports-dir"),
    hypothesisConfigPath:
      readFlagValue(argv, "--hypothesis-config") ?? DEFAULT_CALIBRATION_FADE_V2_HYPOTHESIS_CONFIG_PATH,
    provenancePath: readFlagValue(argv, "--provenance") ?? DEFAULT_CALIBRATION_FADE_V2_PROVENANCE_PATH,
    hypothesisId: readFlagValue(argv, "--hypothesis-id"),
    outputPath: readFlagValue(argv, "--output"),
    htmlOutputPath: readFlagValue(argv, "--html-output"),
    marketsOutputPath: readFlagValue(argv, "--markets-output"),
    runsOutputPath: readFlagValue(argv, "--runs-output"),
    appearancesOutputPath: readFlagValue(argv, "--appearances-output"),
  };
}
