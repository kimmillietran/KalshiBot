import {
  DEFAULT_MONTH_REGIME_ANALYSIS_HTML_PATH,
  DEFAULT_MONTH_REGIME_ANALYSIS_OUTPUT_PATH,
  DEFAULT_MONTH_REGIME_HYPOTHESIS_CANDIDATES_PATH,
  DEFAULT_MONTH_REGIME_HYPOTHESIS_VALIDATION_PATH,
  DEFAULT_MONTH_REGIME_REGIME_TAGS_PATH,
  DEFAULT_MONTH_REGIME_RESEARCH_RESULTS_DIR,
  MonthRegimeAnalysisError,
} from "@/lib/data/research/monthRegimeAnalysis";

export class MonthRegimeAnalysisCommandError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MonthRegimeAnalysisCommandError";
  }
}

export type MonthRegimeAnalysisCommandIo = {
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
        throw new MonthRegimeAnalysisCommandError(`Missing value for ${flag} <path>`);
      }
      return next;
    }
  }

  return defaultValue;
}

export function parseMonthRegimeAnalysisInputPathsFromArgv(argv: readonly string[]) {
  return {
    hypothesisCandidatesPath: readFlagValue(
      argv,
      "--hypothesis-candidates",
      DEFAULT_MONTH_REGIME_HYPOTHESIS_CANDIDATES_PATH,
    ),
    hypothesisValidationPath: readFlagValue(
      argv,
      "--hypothesis-validation",
      DEFAULT_MONTH_REGIME_HYPOTHESIS_VALIDATION_PATH,
    ),
    regimeTagsPath: readFlagValue(
      argv,
      "--regime-tags",
      DEFAULT_MONTH_REGIME_REGIME_TAGS_PATH,
    ),
    researchResultsDir: readFlagValue(
      argv,
      "--research-results-dir",
      DEFAULT_MONTH_REGIME_RESEARCH_RESULTS_DIR,
    ),
  };
}

export function parseMonthRegimeAnalysisConfigFromArgv(argv: readonly string[]) {
  return {
    outputPath: readFlagValue(
      argv,
      "--output",
      DEFAULT_MONTH_REGIME_ANALYSIS_OUTPUT_PATH,
    ),
    htmlOutputPath: readFlagValue(
      argv,
      "--html-output",
      DEFAULT_MONTH_REGIME_ANALYSIS_HTML_PATH,
    ),
    inputPaths: parseMonthRegimeAnalysisInputPathsFromArgv(argv),
  };
}

export function formatStdoutOutput(serialized: string): string {
  return serialized.endsWith("\n") ? serialized : `${serialized}\n`;
}

export function mapCommandError(error: unknown): string {
  if (
    error instanceof MonthRegimeAnalysisCommandError
    || error instanceof MonthRegimeAnalysisError
  ) {
    return error.message;
  }

  return error instanceof Error ? error.message : "Month/regime analysis failed";
}
