import type { BidOnlyCandidateLifecycleConfig } from "./bidOnlyCandidateLifecycleTypes";
import {
  DEFAULT_BID_ONLY_CANDIDATE_LIFECYCLE_HTML_PATH,
  DEFAULT_BID_ONLY_CANDIDATE_LIFECYCLE_INPUT_DIR,
  DEFAULT_BID_ONLY_CANDIDATE_LIFECYCLE_OUTPUT_PATH,
  DEFAULT_STATIC_PARITY_SCAN_ARTIFACT_PATH,
} from "./bidOnlyCandidateLifecycleTypes";

export type BidOnlyCandidateLifecycleArgv = {
  forwardQuotesDir: string;
  outputPath: string;
  htmlOutputPath: string;
  staticParityScanPath: string | null;
  configOverrides: Partial<BidOnlyCandidateLifecycleConfig>;
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

export function parseBidOnlyCandidateLifecycleArgv(
  argv: readonly string[],
): BidOnlyCandidateLifecycleArgv {
  return {
    forwardQuotesDir:
      readFlagValue(argv, "--forward-quotes-dir") ?? DEFAULT_BID_ONLY_CANDIDATE_LIFECYCLE_INPUT_DIR,
    outputPath:
      readFlagValue(argv, "--output") ?? DEFAULT_BID_ONLY_CANDIDATE_LIFECYCLE_OUTPUT_PATH,
    htmlOutputPath:
      readFlagValue(argv, "--html-output") ?? DEFAULT_BID_ONLY_CANDIDATE_LIFECYCLE_HTML_PATH,
    staticParityScanPath:
      readFlagValue(argv, "--static-parity-scan") ?? DEFAULT_STATIC_PARITY_SCAN_ARTIFACT_PATH,
    configOverrides: {
      maxGapMs: readNumericFlag(argv, "--max-gap-ms"),
      minEpisodeDurationMs: readNumericFlag(argv, "--min-episode-duration-ms"),
      minEdgeCents: readNumericFlag(argv, "--min-edge-cents"),
      minSizeContracts: readNumericFlag(argv, "--min-size-contracts"),
      pricingModel: "bid-only",
    },
  };
}
