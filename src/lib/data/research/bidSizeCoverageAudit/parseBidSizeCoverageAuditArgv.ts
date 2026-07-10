import {
  DEFAULT_BID_SIZE_COVERAGE_AUDIT_CONFIG,
  DEFAULT_BID_SIZE_COVERAGE_AUDIT_HTML_PATH,
  DEFAULT_BID_SIZE_COVERAGE_AUDIT_OUTPUT_PATH,
  BidSizeCoverageAuditError,
  type BidSizeCoverageAuditConfig,
} from "./bidSizeCoverageAuditTypes";

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

export function parseBidSizeCoverageAuditArgv(argv: readonly string[]): {
  outputPath: string;
  htmlOutputPath: string;
  config: BidSizeCoverageAuditConfig;
} {
  const captureRunDir =
    readArgValue(argv, "--capture-run-dir")
    ?? DEFAULT_BID_SIZE_COVERAGE_AUDIT_CONFIG.captureRunDir;
  const outputPath =
    readArgValue(argv, "--output")
    ?? readArgValue(argv, "-o")
    ?? DEFAULT_BID_SIZE_COVERAGE_AUDIT_OUTPUT_PATH;
  const htmlOutputPath =
    readArgValue(argv, "--html")
    ?? readArgValue(argv, "--html-output")
    ?? DEFAULT_BID_SIZE_COVERAGE_AUDIT_HTML_PATH;

  if (!captureRunDir) {
    throw new BidSizeCoverageAuditError("Missing --capture-run-dir.");
  }

  return {
    outputPath,
    htmlOutputPath,
    config: {
      captureRunDir,
      marketTicker: readArgValue(argv, "--market-ticker"),
      maxRawMessages:
        readNumberArg(argv, "--max-raw-messages")
        ?? DEFAULT_BID_SIZE_COVERAGE_AUDIT_CONFIG.maxRawMessages,
      sampleLimit:
        readNumberArg(argv, "--sample-limit")
        ?? DEFAULT_BID_SIZE_COVERAGE_AUDIT_CONFIG.sampleLimit,
    },
  };
}

export {
  DEFAULT_BID_SIZE_COVERAGE_AUDIT_CONFIG,
  DEFAULT_BID_SIZE_COVERAGE_AUDIT_HTML_PATH,
  DEFAULT_BID_SIZE_COVERAGE_AUDIT_OUTPUT_PATH,
};
