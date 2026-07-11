import {
  CaptureHealthReconciliationError,
  DEFAULT_CAPTURE_HEALTH_RECONCILIATION_HTML_PATH,
  DEFAULT_CAPTURE_HEALTH_RECONCILIATION_OUTPUT_PATH,
  DEFAULT_CAPTURE_TIMELINE_ATTRIBUTION_HTML_PATH,
  DEFAULT_CAPTURE_TIMELINE_ATTRIBUTION_OUTPUT_PATH,
} from "./captureHealthReconciliationTypes";
import { createCaptureHealthReconciliationConfig } from "./captureHealthReconciliationConfig";

function readArgValue(argv: readonly string[], flag: string): string | null {
  const index = argv.indexOf(flag);
  if (index === -1) {
    return null;
  }

  return argv[index + 1] ?? null;
}

export function parseCaptureHealthReconciliationArgv(argv: readonly string[]): {
  outputPath: string;
  htmlOutputPath: string;
  timelineOutputPath: string;
  timelineHtmlOutputPath: string;
  config: ReturnType<typeof createCaptureHealthReconciliationConfig>;
} {
  const captureRunDir = readArgValue(argv, "--capture-run-dir");
  if (!captureRunDir) {
    throw new CaptureHealthReconciliationError("Missing required --capture-run-dir.");
  }

  return {
    outputPath:
      readArgValue(argv, "--output")
      ?? readArgValue(argv, "-o")
      ?? DEFAULT_CAPTURE_HEALTH_RECONCILIATION_OUTPUT_PATH,
    htmlOutputPath:
      readArgValue(argv, "--html")
      ?? readArgValue(argv, "--html-output")
      ?? DEFAULT_CAPTURE_HEALTH_RECONCILIATION_HTML_PATH,
    timelineOutputPath:
      readArgValue(argv, "--timeline-output")
      ?? DEFAULT_CAPTURE_TIMELINE_ATTRIBUTION_OUTPUT_PATH,
    timelineHtmlOutputPath:
      readArgValue(argv, "--timeline-html")
      ?? DEFAULT_CAPTURE_TIMELINE_ATTRIBUTION_HTML_PATH,
    config: createCaptureHealthReconciliationConfig({
      captureRunDir,
    }),
  };
}
