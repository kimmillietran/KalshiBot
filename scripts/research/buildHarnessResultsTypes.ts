import {
  DEFAULT_STRATEGY_LEADERBOARD_OUTPUT_PATH,
} from "@/lib/data/research/leaderboard/strategyLeaderboardTypes";
import {
  DEFAULT_HYPOTHESIS_VALIDATION_INPUT_PATH,
  DEFAULT_STRATEGY_SYNTHESIS_OUTPUT_PATH,
} from "@/lib/data/research/strategySynthesis";
import {
  DEFAULT_HARNESS_RESULTS_HTML_PATH,
  DEFAULT_HARNESS_RESULTS_OUTPUT_PATH,
  DEFAULT_STRATEGY_HARNESS_OUTPUT_DIR,
  DEFAULT_STRATEGY_HARNESS_SUMMARY_PATH,
} from "@/lib/data/research/harnessResults";

export class HarnessResultsCommandError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HarnessResultsCommandError";
  }
}

export type HarnessResultsCommandIo = {
  readFile: (path: string) => string;
  fileExists: (path: string) => boolean;
  writeStdout: (text: string) => void;
  writeStderr: (text: string) => void;
  writeFile: (path: string, data: string) => void;
  mkdirSync: (path: string, options: { recursive: boolean }) => void;
};

export function parseOutputPathFromArgv(
  argv: readonly string[],
  defaultPath = DEFAULT_HARNESS_RESULTS_OUTPUT_PATH,
): string {
  return parseArtifactPathFromArgv(argv, "--output", defaultPath);
}

export function parseHtmlOutputPathFromArgv(
  argv: readonly string[],
  defaultPath = DEFAULT_HARNESS_RESULTS_HTML_PATH,
): string {
  return parseArtifactPathFromArgv(argv, "--html-output", defaultPath);
}

export function parseInputPathsFromArgv(argv: readonly string[]): {
  synthesisPath: string;
  harnessSummaryPath: string;
  harnessOutputDir: string;
  hypothesisValidationPath: string | null;
  strategyLeaderboardPath: string | null;
} {
  return {
    synthesisPath: parseArtifactPathFromArgv(
      argv,
      "--synthesis",
      DEFAULT_STRATEGY_SYNTHESIS_OUTPUT_PATH,
    ),
    harnessSummaryPath: parseArtifactPathFromArgv(
      argv,
      "--harness-summary",
      DEFAULT_STRATEGY_HARNESS_SUMMARY_PATH,
    ),
    harnessOutputDir: parseArtifactPathFromArgv(
      argv,
      "--harness-dir",
      DEFAULT_STRATEGY_HARNESS_OUTPUT_DIR,
    ),
    hypothesisValidationPath: parseOptionalArtifactPathFromArgv(
      argv,
      "--hypothesis-validation",
      DEFAULT_HYPOTHESIS_VALIDATION_INPUT_PATH,
    ),
    strategyLeaderboardPath: parseOptionalArtifactPathFromArgv(
      argv,
      "--leaderboard",
      DEFAULT_STRATEGY_LEADERBOARD_OUTPUT_PATH,
    ),
  };
}

function parseArtifactPathFromArgv(
  argv: readonly string[],
  flag: string,
  defaultPath: string,
): string {
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === flag) {
      const next = argv[index + 1];
      if (!next || next.startsWith("-")) {
        throw new HarnessResultsCommandError(`Missing value for ${flag} <path>`);
      }
      return next;
    }
  }

  return defaultPath;
}

function parseOptionalArtifactPathFromArgv(
  argv: readonly string[],
  flag: string,
  defaultPath: string,
): string | null {
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === flag) {
      const next = argv[index + 1];
      if (!next || next.startsWith("-")) {
        throw new HarnessResultsCommandError(`Missing value for ${flag} <path>`);
      }
      return next;
    }
  }

  return defaultPath;
}

export function formatStdoutOutput(serialized: string): string {
  return serialized.endsWith("\n") ? serialized : `${serialized}\n`;
}

export function mapCommandError(error: unknown): string {
  if (error instanceof HarnessResultsCommandError) {
    return error.message;
  }

  return error instanceof Error ? error.message : "Harness results build failed";
}
