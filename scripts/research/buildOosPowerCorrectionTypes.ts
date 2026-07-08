import {
  DEFAULT_OOS_CORRECTION_ALPHA,
  DEFAULT_OOS_HYPOTHESIS_CANDIDATES_PATH,
  DEFAULT_OOS_HYPOTHESIS_TRADE_REPLAY_PATH,
  DEFAULT_OOS_POWER_CORRECTION_HTML_PATH,
  DEFAULT_OOS_POWER_CORRECTION_OUTPUT_PATH,
  DEFAULT_OOS_REGIME_TAGS_PATH,
  DEFAULT_OOS_RESEARCH_RESULTS_DIR,
  OosPowerCorrectionError,
} from "@/lib/data/research/oosPowerCorrection";
import type { OosCorrectionMethodId } from "@/lib/data/research/oosPowerCorrection/oosPowerCorrectionTypes";
import {
  parseExplicitTemporalSplitSpec,
} from "@/lib/data/research/oosPowerCorrection/computeTemporalResearchSplits";

export class OosPowerCorrectionCommandError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OosPowerCorrectionCommandError";
  }
}

export type OosPowerCorrectionCommandIo = {
  readFile: (path: string) => string;
  fileExists: (path: string) => boolean;
  readdir: (path: string) => readonly string[];
  isDirectory: (path: string) => boolean;
  writeStdout: (text: string) => void;
  writeStderr: (text: string) => void;
  writeFile: (path: string, data: string) => void;
  mkdirSync: (path: string, options: { recursive: boolean }) => void;
};

function readFlagValue(argv: readonly string[], flag: string, defaultValue: string): string {
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === flag) {
      const next = argv[index + 1];
      if (!next || next.startsWith("-")) {
        throw new OosPowerCorrectionCommandError(`Missing value for ${flag} <path>`);
      }
      return next;
    }
  }

  return defaultValue;
}

function hasFlag(argv: readonly string[], flag: string): boolean {
  return argv.includes(flag);
}

function collectSplitFlags(argv: readonly string[]): string[] {
  const splits: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value?.startsWith("--split")) {
      const next = argv[index + 1];
      if (next && !next.startsWith("-")) {
        splits.push(next);
      }
    }
    if (value?.startsWith("train=") || value?.startsWith("validation=") || value?.startsWith("holdout=")) {
      splits.push(value);
    }
  }

  return splits;
}

export function parseOosPowerCorrectionConfigFromArgv(argv: readonly string[]) {
  const splitFlags = collectSplitFlags(argv);
  const explicit = parseExplicitTemporalSplitSpec(splitFlags);

  const correctionRaw = readFlagValue(argv, "--correction", "by");
  const correctionMethod: OosCorrectionMethodId =
    correctionRaw === "blockBootstrap" ? "blockBootstrap" : "benjaminiYekutieli";

  return {
    outputPath: readFlagValue(argv, "--output", DEFAULT_OOS_POWER_CORRECTION_OUTPUT_PATH),
    htmlOutputPath: readFlagValue(argv, "--html-output", DEFAULT_OOS_POWER_CORRECTION_HTML_PATH),
    inputPaths: {
      hypothesisCandidatesPath: readFlagValue(
        argv,
        "--hypotheses",
        DEFAULT_OOS_HYPOTHESIS_CANDIDATES_PATH,
      ),
      hypothesisTradeReplayPath: readFlagValue(
        argv,
        "--trade-replay",
        DEFAULT_OOS_HYPOTHESIS_TRADE_REPLAY_PATH,
      ),
      researchResultsDir: readFlagValue(
        argv,
        "--research-results-dir",
        DEFAULT_OOS_RESEARCH_RESULTS_DIR,
      ),
      regimeTagsPath: readFlagValue(argv, "--regime-tags", DEFAULT_OOS_REGIME_TAGS_PATH),
    },
    config: {
      alpha: DEFAULT_OOS_CORRECTION_ALPHA,
      correctionMethod,
      blockKey: "market-day" as const,
      officialOnly: hasFlag(argv, "--official-only"),
      explicitSplit: explicit
        ? {
            trainMonths: explicit.train ?? [],
            validationMonths: explicit.validation ?? [],
            holdoutMonths: explicit.holdout ?? [],
          }
        : null,
    },
  };
}

export function formatStdoutOutput(serialized: string): string {
  return serialized.endsWith("\n") ? serialized : `${serialized}\n`;
}

export function mapCommandError(error: unknown): string {
  if (
    error instanceof OosPowerCorrectionCommandError
    || error instanceof OosPowerCorrectionError
  ) {
    return error.message;
  }

  return error instanceof Error ? error.message : "OOS power correction failed";
}
