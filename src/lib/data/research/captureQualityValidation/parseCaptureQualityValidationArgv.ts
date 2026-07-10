import type { CaptureQualityValidationThresholds } from "./captureQualityValidationTypes";
import {
  DEFAULT_CAPTURE_QUALITY_VALIDATION_HTML_OUTPUT_PATH,
  DEFAULT_CAPTURE_QUALITY_VALIDATION_OUTPUT_PATH,
  DEFAULT_FORWARD_QUOTES_SCAN_DIR,
} from "./captureQualityValidationTypes";

export type CaptureQualityValidationArgv = {
  forwardQuotesDir: string;
  outputPath: string;
  htmlOutputPath: string;
  thresholdOverrides: Partial<CaptureQualityValidationThresholds>;
};


function readFlagValue(argv: readonly string[], flag: string): string | undefined {
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === flag) {
      return argv[index + 1];
    }
  }

  return undefined;
}

function readNumericFlag(argv: readonly string[], flag: string): number | undefined {
  const value = readFlagValue(argv, flag);
  if (!value) {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function parseCaptureQualityValidationArgv(
  argv: readonly string[],
): CaptureQualityValidationArgv {
  const thresholdOverrides: Partial<CaptureQualityValidationThresholds> = {
    minEconomicallyValidShare: readNumericFlag(argv, "--min-economically-valid-share"),
    minParityUsableRecords: readNumericFlag(argv, "--min-parity-usable-records"),
    maxHealthCountMismatch: readNumericFlag(argv, "--max-health-count-mismatch"),
    maxEconomicStateMismatchRecords: readNumericFlag(
      argv,
      "--max-economic-state-mismatch-records",
    ),
    maxMalformedJsonlLines: readNumericFlag(argv, "--max-malformed-jsonl-lines"),
    maxEmptyRolloverRecordShare: readNumericFlag(argv, "--max-empty-rollover-share"),
  };

  return {
    forwardQuotesDir: readFlagValue(argv, "--forward-quotes-dir") ?? DEFAULT_FORWARD_QUOTES_SCAN_DIR,
    outputPath: readFlagValue(argv, "--output") ?? DEFAULT_CAPTURE_QUALITY_VALIDATION_OUTPUT_PATH,
    htmlOutputPath:
      readFlagValue(argv, "--html-output")
      ?? DEFAULT_CAPTURE_QUALITY_VALIDATION_HTML_OUTPUT_PATH,
    thresholdOverrides,
  };
}
