import {
  DEFAULT_FEATURE_CATALOG_EXPLORER_HTML_PATH,
  DEFAULT_FEATURE_CATALOG_EXPLORER_INPUT_PATHS,
  DEFAULT_FEATURE_CATALOG_EXPLORER_OUTPUT_PATH,
  type FeatureCatalogExplorerInputPaths,
} from "./featureCatalogExplorerTypes";

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

export function parseFeatureCatalogExplorerPathsFromArgv(
  argv: readonly string[],
): {
  outputPath: string;
  htmlOutputPath: string;
  inputPaths: FeatureCatalogExplorerInputPaths;
} {
  return {
    outputPath: readFlagValue(
      argv,
      "--output",
      DEFAULT_FEATURE_CATALOG_EXPLORER_OUTPUT_PATH,
    ),
    htmlOutputPath: readFlagValue(
      argv,
      "--html-output",
      DEFAULT_FEATURE_CATALOG_EXPLORER_HTML_PATH,
    ),
    inputPaths: {
      dimensionExplorerPath: readFlagValue(
        argv,
        "--dimension-explorer",
        DEFAULT_FEATURE_CATALOG_EXPLORER_INPUT_PATHS.dimensionExplorerPath,
      ),
      portfolioAnalyticsPath: readFlagValue(
        argv,
        "--portfolio-analytics",
        DEFAULT_FEATURE_CATALOG_EXPLORER_INPUT_PATHS.portfolioAnalyticsPath,
      ),
      roiAnalysisPath: readFlagValue(
        argv,
        "--roi-analysis",
        DEFAULT_FEATURE_CATALOG_EXPLORER_INPUT_PATHS.roiAnalysisPath,
      ),
      duplicationAnalysisPath: readFlagValue(
        argv,
        "--duplication-analysis",
        DEFAULT_FEATURE_CATALOG_EXPLORER_INPUT_PATHS.duplicationAnalysisPath,
      ),
    },
  };
}
