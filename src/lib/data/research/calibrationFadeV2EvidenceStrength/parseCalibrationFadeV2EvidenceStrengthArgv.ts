import {
  DEFAULT_CALIBRATION_FADE_V2_HYPOTHESIS_CONFIG_PATH,
  DEFAULT_CALIBRATION_FADE_V2_PROVENANCE_PATH,
} from "../calibrationFadeV2Preregistration";

import {
  CalibrationFadeV2EvidenceStrengthError,
  type CalibrationFadeV2EvidenceStrengthConfig,
} from "./calibrationFadeV2EvidenceStrengthTypes";

const KNOWN_FLAGS = new Set([
  "--cross-run-report",
  "--markets",
  "--hypothesis-config",
  "--provenance",
  "--output",
  "--html-output",
]);

function readAllFlagValues(argv: readonly string[], flag: string): string[] {
  const values: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] !== flag) {
      continue;
    }
    const value = argv[index + 1];
    if (typeof value !== "string" || value.trim().length === 0 || value.startsWith("--")) {
      throw new CalibrationFadeV2EvidenceStrengthError(`${flag} requires a value`);
    }
    values.push(value.trim());
  }
  return values;
}

function readFlagValue(argv: readonly string[], flag: string): string | null {
  const values = readAllFlagValues(argv, flag);
  if (values.length > 1) {
    throw new CalibrationFadeV2EvidenceStrengthError(`${flag} may be specified at most once`);
  }
  return values[0] ?? null;
}

export function parseCalibrationFadeV2EvidenceStrengthArgv(
  argv: readonly string[],
): CalibrationFadeV2EvidenceStrengthConfig {
  if (
    argv.includes("--latest")
    || argv.includes("--use-latest")
    || argv.includes("--mtime")
  ) {
    throw new CalibrationFadeV2EvidenceStrengthError(
      "Evidence-strength audit does not support latest/mtime discovery; pass --cross-run-report explicitly.",
    );
  }

  const unknown = argv.filter((token) => token.startsWith("--") && !KNOWN_FLAGS.has(token));
  if (unknown.length > 0) {
    throw new CalibrationFadeV2EvidenceStrengthError(
      `Unknown CLI flag: ${unknown[0]}. Evidence-strength audit requires an explicit --cross-run-report path `
        + "and does not discover latest or mtime-ordered artifacts.",
    );
  }

  const crossRunReportPath = readFlagValue(argv, "--cross-run-report");
  if (!crossRunReportPath) {
    throw new CalibrationFadeV2EvidenceStrengthError(
      "--cross-run-report is required; implicit artifact discovery is forbidden",
    );
  }

  return {
    crossRunReportPath,
    marketsPath: readFlagValue(argv, "--markets"),
    hypothesisConfigPath:
      readFlagValue(argv, "--hypothesis-config") ?? DEFAULT_CALIBRATION_FADE_V2_HYPOTHESIS_CONFIG_PATH,
    provenancePath: readFlagValue(argv, "--provenance") ?? DEFAULT_CALIBRATION_FADE_V2_PROVENANCE_PATH,
    outputPath: readFlagValue(argv, "--output"),
    htmlOutputPath: readFlagValue(argv, "--html-output"),
  };
}
