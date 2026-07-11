import {
  DEFAULT_PARITY_NEAR_MISS_ANALYSIS_HTML_PATH,
  DEFAULT_PARITY_NEAR_MISS_ANALYSIS_OUTPUT_PATH,
  ParityNearMissAnalysisError,
  type ParityNearMissAnalysisConfig,
} from "./parityNearMissAnalysisTypes";
import { createParityNearMissAnalysisConfig } from "./parityNearMissAnalysisConfig";

function readArgValue(argv: readonly string[], flag: string): string | null {
  const index = argv.indexOf(flag);
  if (index === -1) {
    return null;
  }
  return argv[index + 1] ?? null;
}

function readNumberArg(argv: readonly string[], flag: string): number | null {
  const value = readArgValue(argv, flag);
  if (value === null) {
    return null;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

export function parseParityNearMissAnalysisArgv(argv: readonly string[]): {
  outputPath: string;
  htmlOutputPath: string;
  config: ParityNearMissAnalysisConfig;
} {
  const captureRunDir = readArgValue(argv, "--capture-run-dir");
  if (!captureRunDir) {
    throw new ParityNearMissAnalysisError("Missing required --capture-run-dir.");
  }

  const outputPath =
    readArgValue(argv, "--output")
    ?? readArgValue(argv, "-o")
    ?? DEFAULT_PARITY_NEAR_MISS_ANALYSIS_OUTPUT_PATH;
  const htmlOutputPath =
    readArgValue(argv, "--html")
    ?? readArgValue(argv, "--html-output")
    ?? DEFAULT_PARITY_NEAR_MISS_ANALYSIS_HTML_PATH;

  return {
    outputPath,
    htmlOutputPath,
    config: createParityNearMissAnalysisConfig({
      captureRunDir,
      nearMissLimit: readNumberArg(argv, "--near-miss-limit") ?? undefined,
      stalenessBoundMs: readNumberArg(argv, "--staleness-bound-ms") ?? undefined,
    }),
  };
}
