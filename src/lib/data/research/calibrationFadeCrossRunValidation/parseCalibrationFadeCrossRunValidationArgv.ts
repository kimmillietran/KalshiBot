import {
  DEFAULT_CALIBRATION_FADE_HYPOTHESIS_CONFIG_PATH,
} from "@/lib/data/research/calibrationFadeForwardValidation";
import { resolveSelectedRunId } from "@/lib/data/research/selectedRunCaptureHealth";

import {
  CalibrationFadeCrossRunValidationError,
  DEFAULT_CALIBRATION_FADE_CROSS_RUN_APPEARANCES_PATH,
  DEFAULT_CALIBRATION_FADE_CROSS_RUN_MARKETS_PATH,
  DEFAULT_CALIBRATION_FADE_CROSS_RUN_RUNS_PATH,
  DEFAULT_CALIBRATION_FADE_CROSS_RUN_VALIDATION_HTML_PATH,
  DEFAULT_CALIBRATION_FADE_CROSS_RUN_VALIDATION_OUTPUT_PATH,
  type CalibrationFadeCrossRunValidationConfig,
} from "./calibrationFadeCrossRunValidationTypes";

function normalizeCapturePath(path: string): string {
  return path.replace(/\\/g, "/").replace(/\/$/, "");
}

function readAllFlagValues(argv: readonly string[], flag: string): string[] {
  const values: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === flag) {
      const value = argv[index + 1];
      if (typeof value !== "string" || value.trim().length === 0 || value.startsWith("--")) {
        throw new CalibrationFadeCrossRunValidationError(
          `${flag} requires a non-empty path argument.`,
        );
      }
      values.push(value.trim());
      index += 1;
    }
  }
  return values;
}

function readFlagValue(argv: readonly string[], flag: string): string | null {
  const values = readAllFlagValues(argv, flag);
  return values.length > 0 ? values[values.length - 1]! : null;
}

/** Parses CLI args for cross-run calibration-fade validation. */
export function parseCalibrationFadeCrossRunValidationArgv(argv: readonly string[]): {
  outputPath: string;
  htmlOutputPath: string;
  hypothesisId: string | null;
  config: CalibrationFadeCrossRunValidationConfig;
} {
  const captureRunDirsRaw = readAllFlagValues(argv, "--capture-run-dir");
  if (captureRunDirsRaw.length < 2) {
    throw new CalibrationFadeCrossRunValidationError(
      "At least two --capture-run-dir values are required; cross-run mode does not discover or fall back to latest captures.",
    );
  }

  const operatorProvidedRunOrder = captureRunDirsRaw.map(normalizeCapturePath);
  const normalizedDirs = operatorProvidedRunOrder.map((dir) => normalizeCapturePath(dir));
  const runIds = normalizedDirs.map((dir) => resolveSelectedRunId(dir));

  const seenDirs = new Set<string>();
  const seenIds = new Set<string>();
  for (let index = 0; index < normalizedDirs.length; index += 1) {
    const dir = normalizedDirs[index]!;
    const runId = runIds[index]!;
    if (seenDirs.has(dir)) {
      throw new CalibrationFadeCrossRunValidationError(
        `Duplicate normalized capture run directory: ${dir}`,
      );
    }
    if (seenIds.has(runId)) {
      throw new CalibrationFadeCrossRunValidationError(`Duplicate capture run ID: ${runId}`);
    }
    seenDirs.add(dir);
    seenIds.add(runId);
  }

  return {
    outputPath:
      readFlagValue(argv, "--output") ?? DEFAULT_CALIBRATION_FADE_CROSS_RUN_VALIDATION_OUTPUT_PATH,
    htmlOutputPath:
      readFlagValue(argv, "--html-output")
      ?? DEFAULT_CALIBRATION_FADE_CROSS_RUN_VALIDATION_HTML_PATH,
    hypothesisId: readFlagValue(argv, "--hypothesis-id"),
    config: {
      captureRunDirs: normalizedDirs,
      operatorProvidedRunOrder,
      hypothesisConfigPath:
        readFlagValue(argv, "--hypothesis-config")
        ?? DEFAULT_CALIBRATION_FADE_HYPOTHESIS_CONFIG_PATH,
      importsDir: readFlagValue(argv, "--imports-dir") ?? "data/imports",
      maximumBtcJoinAgeMs: Number(readFlagValue(argv, "--maximum-btc-join-age-ms") ?? "5000"),
      marketsOutputPath:
        readFlagValue(argv, "--markets-output")
        ?? DEFAULT_CALIBRATION_FADE_CROSS_RUN_MARKETS_PATH,
      runsOutputPath:
        readFlagValue(argv, "--runs-output") ?? DEFAULT_CALIBRATION_FADE_CROSS_RUN_RUNS_PATH,
      appearancesOutputPath:
        readFlagValue(argv, "--appearances-output")
        ?? DEFAULT_CALIBRATION_FADE_CROSS_RUN_APPEARANCES_PATH,
    },
  };
}
