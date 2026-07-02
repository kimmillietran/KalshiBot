import {
  DEFAULT_PIPELINE_IMPORT_FIXED_REQUEST_DELAY_MS,
  type ResearchPipelineConfig,
} from "./researchPipelineTypes";

/** Builds argv for the pipeline's `import:batch` step. */
export function buildImportBatchStepArgs(
  config: ResearchPipelineConfig,
): string[] {
  const baseArgs = [
    "--input-dir",
    "data/import-configs",
    "--output-dir",
    "data/imports",
    "--concurrency",
    String(config.concurrency),
    "--max-retries",
    "5",
    "--retry-base-delay-ms",
    "2000",
  ];

  const throttle = config.importThrottle;

  if (throttle.adaptiveThrottleEnabled) {
    return [
      ...baseArgs,
      "--adaptive-throttle",
      "--min-request-delay-ms",
      String(throttle.minRequestDelayMs),
      "--max-request-delay-ms",
      String(throttle.maxRequestDelayMs),
    ];
  }

  return [
    ...baseArgs,
    "--request-delay-ms",
    String(throttle.fixedRequestDelayMs ?? DEFAULT_PIPELINE_IMPORT_FIXED_REQUEST_DELAY_MS),
  ];
}
