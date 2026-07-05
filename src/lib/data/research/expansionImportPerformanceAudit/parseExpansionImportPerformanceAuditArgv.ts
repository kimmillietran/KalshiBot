import {
  DEFAULT_EXPANSION_IMPORT_CONFIGS_DIR,
  DEFAULT_EXPANSION_IMPORTS_DIR,
  DEFAULT_EXPANSION_IMPORT_PERFORMANCE_AUDIT_HTML_PATH,
  DEFAULT_EXPANSION_IMPORT_PERFORMANCE_AUDIT_OUTPUT_PATH,
  DEFAULT_HISTORICAL_EXPANSION_IMPORT_CHECKPOINT_PATH,
  DEFAULT_HISTORICAL_EXPANSION_IMPORT_SUMMARY_PATH,
  type ExpansionImportPerformanceAuditConfig,
} from "./expansionImportPerformanceAuditTypes";

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

export function parseExpansionImportPerformanceAuditConfigFromArgv(
  argv: readonly string[],
): ExpansionImportPerformanceAuditConfig {
  return {
    outputPath: readFlagValue(
      argv,
      "--output",
      DEFAULT_EXPANSION_IMPORT_PERFORMANCE_AUDIT_OUTPUT_PATH,
    ),
    htmlOutputPath: readFlagValue(
      argv,
      "--html-output",
      DEFAULT_EXPANSION_IMPORT_PERFORMANCE_AUDIT_HTML_PATH,
    ),
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
    importConfigsDir: readFlagValue(
      argv,
      "--import-configs-dir",
      DEFAULT_EXPANSION_IMPORT_CONFIGS_DIR,
    ),
    importsDir: readFlagValue(argv, "--imports-dir", DEFAULT_EXPANSION_IMPORTS_DIR),
  };
}

export function defaultExpansionImportPerformanceAuditConfig(): ExpansionImportPerformanceAuditConfig {
  return parseExpansionImportPerformanceAuditConfigFromArgv([]);
}
