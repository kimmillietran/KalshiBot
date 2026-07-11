import {
  DEFAULT_BID_ONLY_CANDIDATE_LIFECYCLE_PATH,
  DEFAULT_FORWARD_QUOTES_CAPTURE_DIR,
  DEFAULT_FORWARD_SETTLEMENT_JOIN_HTML_PATH,
  DEFAULT_FORWARD_SETTLEMENT_JOIN_OUTPUT_PATH,
  DEFAULT_IMPORTS_DIR,
  DEFAULT_STATIC_PARITY_SCAN_PATH,
  ForwardSettlementJoinError,
  type ForwardSettlementJoinConfig,
} from "./forwardSettlementJoinTypes";

function readArgValue(argv: readonly string[], flag: string): string | null {
  const index = argv.indexOf(flag);
  if (index === -1) {
    return null;
  }

  return argv[index + 1] ?? null;
}

export function parseForwardSettlementJoinArgv(argv: readonly string[]): {
  outputPath: string;
  htmlOutputPath: string;
  config: ForwardSettlementJoinConfig;
} {
  const outputPath =
    readArgValue(argv, "--output")
    ?? readArgValue(argv, "-o")
    ?? DEFAULT_FORWARD_SETTLEMENT_JOIN_OUTPUT_PATH;
  const htmlOutputPath =
    readArgValue(argv, "--html")
    ?? readArgValue(argv, "--html-output")
    ?? DEFAULT_FORWARD_SETTLEMENT_JOIN_HTML_PATH;

  const forwardQuotesDir =
    readArgValue(argv, "--forward-quotes-dir")
    ?? DEFAULT_FORWARD_QUOTES_CAPTURE_DIR;
  const importsDir =
    readArgValue(argv, "--imports-dir")
    ?? DEFAULT_IMPORTS_DIR;
  const staticParityScanPath =
    readArgValue(argv, "--static-parity-scan")
    ?? DEFAULT_STATIC_PARITY_SCAN_PATH;
  const bidOnlyCandidateLifecyclePath =
    readArgValue(argv, "--candidate-lifecycle")
    ?? DEFAULT_BID_ONLY_CANDIDATE_LIFECYCLE_PATH;
  const seriesTicker = readArgValue(argv, "--series");

  if (!forwardQuotesDir) {
    throw new ForwardSettlementJoinError("Missing --forward-quotes-dir.");
  }

  return {
    outputPath,
    htmlOutputPath,
    config: {
      forwardQuotesDir,
      importsDir,
      staticParityScanPath,
      bidOnlyCandidateLifecyclePath,
      seriesTicker,
    },
  };
}

export {
  DEFAULT_FORWARD_SETTLEMENT_JOIN_HTML_PATH,
  DEFAULT_FORWARD_SETTLEMENT_JOIN_OUTPUT_PATH,
};
