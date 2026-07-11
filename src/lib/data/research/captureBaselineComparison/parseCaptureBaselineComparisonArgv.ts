import type { CaptureBaselineComparisonConfig } from "./captureBaselineComparisonTypes";
import {
  DEFAULT_CAPTURE_BASELINE_COMPARISON_HTML_PATH,
  DEFAULT_CAPTURE_BASELINE_COMPARISON_INPUT_PATHS,
  DEFAULT_CAPTURE_BASELINE_COMPARISON_OUTPUT_PATH,
} from "./captureBaselineComparisonTypes";

export type CaptureBaselineComparisonArgv = {
  outputPath: string;
  htmlOutputPath: string;
  forwardQuotesDir: string;
  baselineRunId: string | null;
  comparisonRunId: string | null;
  useLatestComparisonRun: boolean;
  useConfiguredBaseline: boolean;
};

function readFlagValue(argv: readonly string[], flag: string): string | undefined {
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === flag) {
      return argv[index + 1];
    }
  }

  return undefined;
}

function hasFlag(argv: readonly string[], flag: string): boolean {
  return argv.includes(flag);
}

export function parseCaptureBaselineComparisonArgv(
  argv: readonly string[],
): CaptureBaselineComparisonArgv {
  return {
    outputPath:
      readFlagValue(argv, "--output") ?? DEFAULT_CAPTURE_BASELINE_COMPARISON_OUTPUT_PATH,
    htmlOutputPath:
      readFlagValue(argv, "--html-output") ?? DEFAULT_CAPTURE_BASELINE_COMPARISON_HTML_PATH,
    forwardQuotesDir:
      readFlagValue(argv, "--forward-quotes-dir")
      ?? DEFAULT_CAPTURE_BASELINE_COMPARISON_INPUT_PATHS.forwardQuotesDir,
    baselineRunId: readFlagValue(argv, "--baseline-run-id") ?? null,
    comparisonRunId: readFlagValue(argv, "--comparison-run-id") ?? null,
    useLatestComparisonRun: hasFlag(argv, "--latest"),
    useConfiguredBaseline: !hasFlag(argv, "--no-configured-baseline"),
  };
}

export function argvToConfig(argv: CaptureBaselineComparisonArgv): CaptureBaselineComparisonConfig {
  return {
    forwardQuotesDir: argv.forwardQuotesDir,
    artifacts: DEFAULT_CAPTURE_BASELINE_COMPARISON_INPUT_PATHS.artifacts,
    baselineRunId: argv.baselineRunId,
    comparisonRunId: argv.comparisonRunId,
    useLatestComparisonRun: argv.useLatestComparisonRun,
    useConfiguredBaseline: argv.useConfiguredBaseline,
  };
}
