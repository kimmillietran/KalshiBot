import {
  DEFAULT_STRATEGY_SYNTHESIS_DEBUG_HARNESS_RESULTS_PATH,
  DEFAULT_STRATEGY_SYNTHESIS_DEBUG_HARNESS_SUMMARY_PATH,
  DEFAULT_STRATEGY_SYNTHESIS_DEBUG_HTML_PATH,
  DEFAULT_STRATEGY_SYNTHESIS_DEBUG_HYPOTHESIS_CANDIDATES_PATH,
  DEFAULT_STRATEGY_SYNTHESIS_DEBUG_HYPOTHESIS_VALIDATION_PATH,
  DEFAULT_STRATEGY_SYNTHESIS_DEBUG_OUTPUT_PATH,
  DEFAULT_STRATEGY_SYNTHESIS_DEBUG_SYNTHESIS_PATH,
  StrategySynthesisDebugError,
  type StrategySynthesisDebugInputPaths,
} from "@/lib/data/research/strategySynthesisDebug";

export class StrategySynthesisDebugCommandError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StrategySynthesisDebugCommandError";
  }
}

export type StrategySynthesisDebugCommandIo = {
  readFile: (path: string) => string;
  fileExists: (path: string) => boolean;
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
        throw new StrategySynthesisDebugCommandError(`Missing value for ${flag} <path>`);
      }
      return next;
    }
  }

  return defaultValue;
}

export function parseStrategySynthesisDebugInputPathsFromArgv(
  argv: readonly string[],
): StrategySynthesisDebugInputPaths {
  return {
    hypothesisCandidatesPath: readFlagValue(
      argv,
      "--hypothesis-candidates",
      DEFAULT_STRATEGY_SYNTHESIS_DEBUG_HYPOTHESIS_CANDIDATES_PATH,
    ),
    hypothesisValidationPath: readFlagValue(
      argv,
      "--hypothesis-validation",
      DEFAULT_STRATEGY_SYNTHESIS_DEBUG_HYPOTHESIS_VALIDATION_PATH,
    ),
    strategySynthesisPath: readFlagValue(
      argv,
      "--strategy-synthesis",
      DEFAULT_STRATEGY_SYNTHESIS_DEBUG_SYNTHESIS_PATH,
    ),
    harnessSummaryPath: readFlagValue(
      argv,
      "--harness-summary",
      DEFAULT_STRATEGY_SYNTHESIS_DEBUG_HARNESS_SUMMARY_PATH,
    ),
    harnessResultsPath: readFlagValue(
      argv,
      "--harness-results",
      DEFAULT_STRATEGY_SYNTHESIS_DEBUG_HARNESS_RESULTS_PATH,
    ),
  };
}

export function parseStrategySynthesisDebugConfigFromArgv(argv: readonly string[]): {
  outputPath: string;
  htmlOutputPath: string;
  inputPaths: StrategySynthesisDebugInputPaths;
} {
  return {
    outputPath: readFlagValue(
      argv,
      "--output",
      DEFAULT_STRATEGY_SYNTHESIS_DEBUG_OUTPUT_PATH,
    ),
    htmlOutputPath: readFlagValue(
      argv,
      "--html-output",
      DEFAULT_STRATEGY_SYNTHESIS_DEBUG_HTML_PATH,
    ),
    inputPaths: parseStrategySynthesisDebugInputPathsFromArgv(argv),
  };
}

export function formatStdoutOutput(serialized: string): string {
  return serialized.endsWith("\n") ? serialized : `${serialized}\n`;
}

export function mapCommandError(error: unknown): string {
  if (
    error instanceof StrategySynthesisDebugCommandError
    || error instanceof StrategySynthesisDebugError
  ) {
    return error.message;
  }

  return error instanceof Error
    ? error.message
    : "Strategy synthesis debug report failed";
}
