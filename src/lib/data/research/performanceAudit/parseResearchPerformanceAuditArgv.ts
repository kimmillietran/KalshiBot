import {
  DEFAULT_PERFORMANCE_AUDIT_ARTIFACT_INDEX_PATH,
  DEFAULT_PERFORMANCE_AUDIT_COVERAGE_PLAN_PATH,
  DEFAULT_PERFORMANCE_AUDIT_EXPERIMENT_INDEX_PATH,
  DEFAULT_PERFORMANCE_AUDIT_FULL_RESEARCH_SUMMARY_PATH,
  DEFAULT_RESEARCH_PERFORMANCE_AUDIT_HTML_PATH,
  DEFAULT_RESEARCH_PERFORMANCE_AUDIT_OUTPUT_PATH,
  type PerformanceAuditConfig,
} from "./performanceAuditTypes";

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

export function parseResearchPerformanceAuditConfigFromArgv(
  argv: readonly string[],
): PerformanceAuditConfig {
  return {
    outputPath: readFlagValue(argv, "--output", DEFAULT_RESEARCH_PERFORMANCE_AUDIT_OUTPUT_PATH),
    htmlOutputPath: readFlagValue(
      argv,
      "--html-output",
      DEFAULT_RESEARCH_PERFORMANCE_AUDIT_HTML_PATH,
    ),
    fullResearchSummaryPath: readFlagValue(
      argv,
      "--full-research-summary",
      DEFAULT_PERFORMANCE_AUDIT_FULL_RESEARCH_SUMMARY_PATH,
    ),
    artifactIndexPath: readFlagValue(
      argv,
      "--artifact-index",
      DEFAULT_PERFORMANCE_AUDIT_ARTIFACT_INDEX_PATH,
    ),
    historicalCoveragePlanPath: readFlagValue(
      argv,
      "--historical-coverage-plan",
      DEFAULT_PERFORMANCE_AUDIT_COVERAGE_PLAN_PATH,
    ),
    experimentIndexPath: readFlagValue(
      argv,
      "--experiment-index",
      DEFAULT_PERFORMANCE_AUDIT_EXPERIMENT_INDEX_PATH,
    ),
  };
}

export function defaultResearchPerformanceAuditConfig(): PerformanceAuditConfig {
  return parseResearchPerformanceAuditConfigFromArgv([]);
}
