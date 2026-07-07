import {
  DEFAULT_DIMENSION_INTERACTION_ANALYSIS_HTML_PATH,
  DEFAULT_DIMENSION_INTERACTION_ANALYSIS_OUTPUT_PATH,
  DEFAULT_INTERACTION_FAILURE_ANALYSIS_PATH,
  DEFAULT_INTERACTION_HYPOTHESIS_CANDIDATES_PATH,
  DEFAULT_INTERACTION_HYPOTHESIS_VALIDATION_PATH,
  DEFAULT_INTERACTION_MISPRICING_ATLAS_PATH,
  DimensionInteractionAnalysisError,
} from "@/lib/data/research/dimensionInteractionAnalytics";

export class DimensionInteractionAnalyticsCommandError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DimensionInteractionAnalyticsCommandError";
  }
}

export type DimensionInteractionAnalyticsCommandIo = {
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
        throw new DimensionInteractionAnalyticsCommandError(`Missing value for ${flag} <path>`);
      }
      return next;
    }
  }

  return defaultValue;
}

export function parseDimensionInteractionAnalyticsInputPathsFromArgv(argv: readonly string[]) {
  return {
    hypothesisCandidatesPath: readFlagValue(
      argv,
      "--hypothesis-candidates",
      DEFAULT_INTERACTION_HYPOTHESIS_CANDIDATES_PATH,
    ),
    hypothesisValidationPath: readFlagValue(
      argv,
      "--hypothesis-validation",
      DEFAULT_INTERACTION_HYPOTHESIS_VALIDATION_PATH,
    ),
    mispricingAtlasPath: readFlagValue(
      argv,
      "--mispricing-atlas",
      DEFAULT_INTERACTION_MISPRICING_ATLAS_PATH,
    ),
    hypothesisFailureAnalysisPath: readFlagValue(
      argv,
      "--hypothesis-failure-analysis",
      DEFAULT_INTERACTION_FAILURE_ANALYSIS_PATH,
    ),
  };
}

export function parseDimensionInteractionAnalyticsConfigFromArgv(argv: readonly string[]) {
  return {
    outputPath: readFlagValue(
      argv,
      "--output",
      DEFAULT_DIMENSION_INTERACTION_ANALYSIS_OUTPUT_PATH,
    ),
    htmlOutputPath: readFlagValue(
      argv,
      "--html-output",
      DEFAULT_DIMENSION_INTERACTION_ANALYSIS_HTML_PATH,
    ),
    inputPaths: parseDimensionInteractionAnalyticsInputPathsFromArgv(argv),
  };
}

export function formatStdoutOutput(serialized: string): string {
  return serialized.endsWith("\n") ? serialized : `${serialized}\n`;
}

export function mapCommandError(error: unknown): string {
  if (
    error instanceof DimensionInteractionAnalyticsCommandError
    || error instanceof DimensionInteractionAnalysisError
  ) {
    return error.message;
  }

  return error instanceof Error ? error.message : "Dimension interaction analysis failed";
}
