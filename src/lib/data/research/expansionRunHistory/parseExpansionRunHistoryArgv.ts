import {
  DEFAULT_EXPANSION_IMPORT_CONFIGS_DIR,
  DEFAULT_EXPANSION_IMPORTS_DIR,
  DEFAULT_HISTORICAL_EXPANSION_IMPORT_CHECKPOINT_PATH,
  DEFAULT_HISTORICAL_EXPANSION_IMPORT_SUMMARY_PATH,
} from "@/lib/data/importJobs/expansionExecutor/expansionExecutorTypes";
import { DEFAULT_EXPANSION_REBUILD_SUMMARY_PATH } from "@/lib/data/research/expansionRebuild/expansionRebuildTypes";
import { DEFAULT_RESEARCH_EXPERIMENT_INDEX_PATH } from "@/lib/data/research/experimentManager/experimentManagerTypes";

import {
  DEFAULT_EXPANSION_RUN_HISTORY_HTML_PATH,
  DEFAULT_EXPANSION_RUN_HISTORY_OUTPUT_PATH,
  type ExpansionRunHistoryInputPaths,
} from "./expansionRunHistoryTypes";

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

export function parseExpansionRunHistoryPathsFromArgv(
  argv: readonly string[],
): {
  outputPath: string;
  htmlOutputPath: string;
  inputPaths: ExpansionRunHistoryInputPaths;
} {
  const historyPath = readFlagValue(
    argv,
    "--output",
    DEFAULT_EXPANSION_RUN_HISTORY_OUTPUT_PATH,
  );

  return {
    outputPath: historyPath,
    htmlOutputPath: readFlagValue(
      argv,
      "--html-output",
      DEFAULT_EXPANSION_RUN_HISTORY_HTML_PATH,
    ),
    inputPaths: {
      expansionImportSummaryPath: readFlagValue(
        argv,
        "--expansion-import-summary",
        DEFAULT_HISTORICAL_EXPANSION_IMPORT_SUMMARY_PATH,
      ),
      expansionImportCheckpointPath: readFlagValue(
        argv,
        "--expansion-import-checkpoint",
        DEFAULT_HISTORICAL_EXPANSION_IMPORT_CHECKPOINT_PATH,
      ),
      expansionRebuildSummaryPath: readFlagValue(
        argv,
        "--expansion-rebuild-summary",
        DEFAULT_EXPANSION_REBUILD_SUMMARY_PATH,
      ),
      experimentIndexPath: readFlagValue(
        argv,
        "--experiment-index",
        DEFAULT_RESEARCH_EXPERIMENT_INDEX_PATH,
      ),
      importConfigsDir: readFlagValue(
        argv,
        "--import-configs-dir",
        DEFAULT_EXPANSION_IMPORT_CONFIGS_DIR,
      ),
      importsDir: readFlagValue(argv, "--imports-dir", DEFAULT_EXPANSION_IMPORTS_DIR),
      historyPath,
    },
  };
}
