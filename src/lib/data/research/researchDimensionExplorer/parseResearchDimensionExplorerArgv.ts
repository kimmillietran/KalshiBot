import {
  DEFAULT_RESEARCH_DIMENSION_EXPLORER_HTML_PATH,
  DEFAULT_RESEARCH_DIMENSION_EXPLORER_INPUT_PATHS,
  DEFAULT_RESEARCH_DIMENSION_EXPLORER_OUTPUT_PATH,
  type ResearchDimensionExplorerInputPaths,
} from "./researchDimensionExplorerTypes";

function readFlagValue(argv: readonly string[], flag: string, defaultValue: string): string {
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === flag) {
      const next = argv[index + 1];
      if (!next || next.startsWith("-")) {
        throw new Error(`Missing value for ${flag} <path>`);
      }
      return next;
    }
  }

  return defaultValue;
}

export function parseResearchDimensionExplorerPathsFromArgv(
  argv: readonly string[],
): {
  outputPath: string;
  htmlOutputPath: string;
  inputPaths: ResearchDimensionExplorerInputPaths;
} {
  return {
    outputPath: readFlagValue(
      argv,
      "--output",
      DEFAULT_RESEARCH_DIMENSION_EXPLORER_OUTPUT_PATH,
    ),
    htmlOutputPath: readFlagValue(
      argv,
      "--html-output",
      DEFAULT_RESEARCH_DIMENSION_EXPLORER_HTML_PATH,
    ),
    inputPaths: {
      mispricingAtlasPath: readFlagValue(
        argv,
        "--mispricing-atlas",
        DEFAULT_RESEARCH_DIMENSION_EXPLORER_INPUT_PATHS.mispricingAtlasPath,
      ),
      hypothesisCandidatesPath: readFlagValue(
        argv,
        "--hypothesis-candidates",
        DEFAULT_RESEARCH_DIMENSION_EXPLORER_INPUT_PATHS.hypothesisCandidatesPath,
      ),
      hypothesisValidationPath: readFlagValue(
        argv,
        "--hypothesis-validation",
        DEFAULT_RESEARCH_DIMENSION_EXPLORER_INPUT_PATHS.hypothesisValidationPath,
      ),
    },
  };
}
