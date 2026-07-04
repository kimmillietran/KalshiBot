import {
  DEFAULT_RESEARCH_EXPERIMENT_INDEX_PATH,
  DEFAULT_RESEARCH_EXPERIMENT_INPUT_PATHS,
  DEFAULT_RESEARCH_EXPERIMENTS_DIR,
  DEFAULT_RESEARCH_EXPERIMENTS_HTML_PATH,
  type ResearchExperimentInputPaths,
} from "./experimentManagerTypes";

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

/** Parses CLI argv into experiment manager paths and output locations. */
export function parseExperimentManagerConfigFromArgv(
  argv: readonly string[],
): {
  experimentsDir: string;
  indexOutputPath: string;
  htmlOutputPath: string;
  inputPaths: ResearchExperimentInputPaths;
} {
  if (argv.includes("--help")) {
    throw new Error("help");
  }

  const inputPaths: ResearchExperimentInputPaths = {
    ...DEFAULT_RESEARCH_EXPERIMENT_INPUT_PATHS,
  };

  return {
    experimentsDir: readFlagValue(argv, "--experiments-dir", DEFAULT_RESEARCH_EXPERIMENTS_DIR),
    indexOutputPath: readFlagValue(
      argv,
      "--index-output",
      DEFAULT_RESEARCH_EXPERIMENT_INDEX_PATH,
    ),
    htmlOutputPath: readFlagValue(
      argv,
      "--html-output",
      DEFAULT_RESEARCH_EXPERIMENTS_HTML_PATH,
    ),
    inputPaths: {
      pipelineSummaryPath: readFlagValue(
        argv,
        "--pipeline-summary",
        inputPaths.pipelineSummaryPath,
      ),
      fullResearchSummaryPath: readFlagValue(
        argv,
        "--full-research-summary",
        inputPaths.fullResearchSummaryPath,
      ),
      hypothesisCandidatesPath: readFlagValue(
        argv,
        "--hypothesis-candidates",
        inputPaths.hypothesisCandidatesPath,
      ),
      hypothesisValidationPath: readFlagValue(
        argv,
        "--hypothesis-validation",
        inputPaths.hypothesisValidationPath,
      ),
      strategySynthesisPath: readFlagValue(
        argv,
        "--strategy-synthesis",
        inputPaths.strategySynthesisPath,
      ),
      harnessResultsPath: readFlagValue(
        argv,
        "--harness-results",
        inputPaths.harnessResultsPath,
      ),
      candidatePromotionsPath: readFlagValue(
        argv,
        "--candidate-promotions",
        inputPaths.candidatePromotionsPath,
      ),
      artifactIndexPath: readFlagValue(
        argv,
        "--artifact-index",
        inputPaths.artifactIndexPath,
      ),
    },
  };
}
