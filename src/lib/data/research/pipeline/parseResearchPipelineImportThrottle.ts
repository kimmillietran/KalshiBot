import {
  DEFAULT_PIPELINE_IMPORT_FIXED_REQUEST_DELAY_MS,
  DEFAULT_PIPELINE_IMPORT_MAX_REQUEST_DELAY_MS,
  DEFAULT_PIPELINE_IMPORT_MIN_REQUEST_DELAY_MS,
  ResearchPipelineError,
  ResearchPipelineErrorCode,
  type ResearchPipelineImportThrottleConfig,
} from "./researchPipelineTypes";

function parseFlagValue(argv: readonly string[], flag: string): string | undefined {
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === flag) {
      const next = argv[index + 1];
      if (!next || next.startsWith("-")) {
        throw new ResearchPipelineError(
          `Missing value for ${flag} <value>`,
          ResearchPipelineErrorCode.INVALID_ARGUMENT,
        );
      }
      return next;
    }
  }

  return undefined;
}

function parseNonNegativeInteger(
  value: string,
  flag: string,
): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new ResearchPipelineError(
      `Invalid ${flag} value: ${value}`,
      ResearchPipelineErrorCode.INVALID_ARGUMENT,
    );
  }

  return parsed;
}

export function parseResearchPipelineImportThrottleFromArgv(
  argv: readonly string[],
): ResearchPipelineImportThrottleConfig {
  const explicitFixedDelay = parseFlagValue(argv, "--request-delay-ms");
  const adaptiveThrottleEnabled = argv.includes("--adaptive-throttle");
  const adaptiveThrottleDisabled = argv.includes("--no-adaptive-throttle");

  if (adaptiveThrottleEnabled && adaptiveThrottleDisabled) {
    throw new ResearchPipelineError(
      "Cannot combine --adaptive-throttle with --no-adaptive-throttle",
      ResearchPipelineErrorCode.INVALID_ARGUMENT,
    );
  }

  if (explicitFixedDelay !== undefined && adaptiveThrottleEnabled) {
    throw new ResearchPipelineError(
      "Cannot combine --request-delay-ms with --adaptive-throttle",
      ResearchPipelineErrorCode.INVALID_ARGUMENT,
    );
  }

  const minRequestDelayMs = parseNonNegativeInteger(
    parseFlagValue(argv, "--min-request-delay-ms")
      ?? String(DEFAULT_PIPELINE_IMPORT_MIN_REQUEST_DELAY_MS),
    "--min-request-delay-ms",
  );
  const maxRequestDelayMs = parseNonNegativeInteger(
    parseFlagValue(argv, "--max-request-delay-ms")
      ?? String(DEFAULT_PIPELINE_IMPORT_MAX_REQUEST_DELAY_MS),
    "--max-request-delay-ms",
  );

  if (minRequestDelayMs > maxRequestDelayMs) {
    throw new ResearchPipelineError(
      "--min-request-delay-ms cannot exceed --max-request-delay-ms",
      ResearchPipelineErrorCode.INVALID_ARGUMENT,
    );
  }

  if (explicitFixedDelay !== undefined || adaptiveThrottleDisabled) {
    return {
      adaptiveThrottleEnabled: false,
      minRequestDelayMs,
      maxRequestDelayMs,
      fixedRequestDelayMs: parseNonNegativeInteger(
        explicitFixedDelay ?? String(DEFAULT_PIPELINE_IMPORT_FIXED_REQUEST_DELAY_MS),
        "--request-delay-ms",
      ),
    };
  }

  return {
    adaptiveThrottleEnabled: true,
    minRequestDelayMs,
    maxRequestDelayMs,
    fixedRequestDelayMs: null,
  };
}
