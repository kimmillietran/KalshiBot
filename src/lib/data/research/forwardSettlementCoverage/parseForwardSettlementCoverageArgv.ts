import {
  DEFAULT_FORWARD_SETTLEMENT_BACKFILL_CHECKPOINT_PATH,
  DEFAULT_FORWARD_SETTLEMENT_COVERAGE_HTML_PATH,
  DEFAULT_FORWARD_SETTLEMENT_COVERAGE_OUTPUT_PATH,
  DEFAULT_IMPORTS_DIR,
  type ForwardSettlementCoverageConfig,
} from "./forwardSettlementCoverageTypes";
import { ForwardSettlementCoverageError } from "./forwardSettlementCoverageTypes";

function readFlagValue(argv: readonly string[], flag: string, defaultValue: string): string {
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === flag) {
      const next = argv[index + 1];
      if (!next || next.startsWith("-")) {
        throw new ForwardSettlementCoverageError(`Missing value for ${flag} <path>`);
      }
      return next;
    }
  }

  return defaultValue;
}

function readNumberFlag(argv: readonly string[], flag: string, defaultValue: number): number {
  const value = readFlagValue(argv, flag, String(defaultValue));
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new ForwardSettlementCoverageError(`Invalid numeric value for ${flag}: ${value}`);
  }

  return parsed;
}

function readRequiredFlag(argv: readonly string[], flag: string): string {
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === flag) {
      const next = argv[index + 1];
      if (!next || next.startsWith("-")) {
        throw new ForwardSettlementCoverageError(`Missing value for ${flag} <path>`);
      }
      return next;
    }
  }

  throw new ForwardSettlementCoverageError(`Missing required ${flag} <path>`);
}

export function parseForwardSettlementCoverageArgv(
  argv: readonly string[],
): ForwardSettlementCoverageConfig {
  return {
    captureRunDir: readRequiredFlag(argv, "--capture-run-dir"),
    importsDir: readFlagValue(argv, "--imports-dir", DEFAULT_IMPORTS_DIR),
    outputPath: readFlagValue(
      argv,
      "--output",
      DEFAULT_FORWARD_SETTLEMENT_COVERAGE_OUTPUT_PATH,
    ),
    htmlOutputPath: readFlagValue(
      argv,
      "--html-output",
      DEFAULT_FORWARD_SETTLEMENT_COVERAGE_HTML_PATH,
    ),
    checkpointPath: readFlagValue(
      argv,
      "--checkpoint-path",
      DEFAULT_FORWARD_SETTLEMENT_BACKFILL_CHECKPOINT_PATH,
    ),
    dryRun: argv.includes("--dry-run"),
    resume: argv.includes("--resume"),
    maxConcurrency: readNumberFlag(argv, "--max-concurrency", 2),
    maxRetries: readNumberFlag(argv, "--max-retries", 3),
    retryBaseDelayMs: readNumberFlag(argv, "--retry-base-delay-ms", 250),
    staleAfterCaptureObservation: !argv.includes("--ignore-stale-after-capture"),
  };
}
