import {
  DEFAULT_RESEARCH_RECOMMENDATIONS_HTML_PATH,
  DEFAULT_RESEARCH_RECOMMENDATION_ENGINE_INPUT_PATHS,
  DEFAULT_RESEARCH_RECOMMENDATIONS_OUTPUT_PATH,
  type ResearchRecommendationEngineInputPaths,
} from "./researchRecommendationEngineTypes";

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

export function parseResearchRecommendationEnginePathsFromArgv(
  argv: readonly string[],
): {
  outputPath: string;
  htmlOutputPath: string;
  inputPaths: ResearchRecommendationEngineInputPaths;
} {
  return {
    outputPath: readFlagValue(
      argv,
      "--output",
      DEFAULT_RESEARCH_RECOMMENDATIONS_OUTPUT_PATH,
    ),
    htmlOutputPath: readFlagValue(
      argv,
      "--html-output",
      DEFAULT_RESEARCH_RECOMMENDATIONS_HTML_PATH,
    ),
    inputPaths: {
      portfolioAnalyticsPath: readFlagValue(
        argv,
        "--portfolio-analytics",
        DEFAULT_RESEARCH_RECOMMENDATION_ENGINE_INPUT_PATHS.portfolioAnalyticsPath,
      ),
      roiAnalysisPath: readFlagValue(
        argv,
        "--roi-analysis",
        DEFAULT_RESEARCH_RECOMMENDATION_ENGINE_INPUT_PATHS.roiAnalysisPath,
      ),
      interactionAnalysisPath: readFlagValue(
        argv,
        "--interaction-analysis",
        DEFAULT_RESEARCH_RECOMMENDATION_ENGINE_INPUT_PATHS.interactionAnalysisPath,
      ),
      dimensionExplorerPath: readFlagValue(
        argv,
        "--dimension-explorer",
        DEFAULT_RESEARCH_RECOMMENDATION_ENGINE_INPUT_PATHS.dimensionExplorerPath,
      ),
      failureAnalysisPath: readFlagValue(
        argv,
        "--failure-analysis",
        DEFAULT_RESEARCH_RECOMMENDATION_ENGINE_INPUT_PATHS.failureAnalysisPath,
      ),
      monthRegimeAnalysisPath: readFlagValue(
        argv,
        "--month-regime-analysis",
        DEFAULT_RESEARCH_RECOMMENDATION_ENGINE_INPUT_PATHS.monthRegimeAnalysisPath,
      ),
    },
  };
}
