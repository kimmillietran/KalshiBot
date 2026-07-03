import {
  DEFAULT_DISCOVERY_RESULT_PATH,
  DEFAULT_FIXTURES_DIR,
  DEFAULT_IMPORT_CONFIGS_DIR,
  DEFAULT_IMPORTS_DIR,
  DEFAULT_LEADERBOARD_PATH,
  DEFAULT_REGISTRY_DIR,
  DEFAULT_REPORT_HTML_PATH,
  DEFAULT_RESEARCH_RESULTS_DIR,
} from "@/lib/data/research/dataHealth";

import type { ResearchArtifactIndexConfig } from "./researchArtifactIndexTypes";
import {
  DEFAULT_RESEARCH_ARTIFACT_INDEX_HTML_PATH,
  DEFAULT_RESEARCH_ARTIFACT_INDEX_OUTPUT_PATH,
} from "./researchArtifactIndexTypes";

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

export function parseResearchArtifactIndexConfigFromArgv(
  argv: readonly string[],
): ResearchArtifactIndexConfig {
  return {
    discoveryResultPath: readFlagValue(argv, "--discovery-result", DEFAULT_DISCOVERY_RESULT_PATH),
    importsDir: readFlagValue(argv, "--imports-dir", DEFAULT_IMPORTS_DIR),
    importConfigsDir: readFlagValue(argv, "--import-configs-dir", DEFAULT_IMPORT_CONFIGS_DIR),
    fixturesDir: readFlagValue(argv, "--fixtures-dir", DEFAULT_FIXTURES_DIR),
    registryDir: readFlagValue(argv, "--registry-dir", DEFAULT_REGISTRY_DIR),
    researchResultsDir: readFlagValue(
      argv,
      "--research-results-dir",
      DEFAULT_RESEARCH_RESULTS_DIR,
    ),
    leaderboardPath: readFlagValue(argv, "--leaderboard", DEFAULT_LEADERBOARD_PATH),
    reportHtmlPath: readFlagValue(argv, "--report-html", DEFAULT_REPORT_HTML_PATH),
    outputPath: readFlagValue(argv, "--output", DEFAULT_RESEARCH_ARTIFACT_INDEX_OUTPUT_PATH),
    htmlOutputPath: readFlagValue(
      argv,
      "--html-output",
      DEFAULT_RESEARCH_ARTIFACT_INDEX_HTML_PATH,
    ),
  };
}

export function defaultResearchArtifactIndexConfig(): ResearchArtifactIndexConfig {
  return parseResearchArtifactIndexConfigFromArgv([]);
}
