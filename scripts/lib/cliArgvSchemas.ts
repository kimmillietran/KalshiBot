import {
  expandEqualsStyleFlags,
  hasCliFlags,
  mapPositionalToFlags,
  mergeNpmBooleanFlags,
  normalizeNpmScriptArgv,
  type NpmArgvField,
} from "./normalizeNpmArgv";

export const DISCOVERY_IMPORT_CONFIGS_ARGV_SCHEMA: readonly NpmArgvField[] = [
  { flag: "--input" },
  { flag: "--output-dir" },
];

export const IMPORT_ANALYZE_FAILURES_ARGV_SCHEMA: readonly NpmArgvField[] = [
  { flag: "--input" },
  { flag: "--output" },
];

export const IMPORT_BATCH_ARGV_SCHEMA: readonly NpmArgvField[] = [
  { flag: "--input-dir" },
  { flag: "--output-dir" },
  { flag: "--concurrency" },
  { flag: "--request-delay-ms" },
  { flag: "--max-retries" },
  { flag: "--retry-base-delay-ms" },
  { flag: "--adaptive-throttle" },
  { flag: "--min-request-delay-ms" },
  { flag: "--max-request-delay-ms" },
  { flag: "--throttle-increase-factor" },
  { flag: "--throttle-decrease-ms" },
  { flag: "--overwrite" },
];

export const DATA_AUDIT_BID_ASK_ARGV_SCHEMA: readonly NpmArgvField[] = [
  { flag: "--input-dir" },
  { flag: "--output" },
];

export const DEBUG_SETTLEMENT_TRACE_ARGV_SCHEMA: readonly NpmArgvField[] = [
  { flag: "--ticker" },
  { flag: "--imports-dir" },
  { flag: "--import-configs-dir" },
  { flag: "--fixtures-dir" },
  { flag: "--registry-dir" },
  { flag: "--research-results-dir" },
  { flag: "--output" },
];

export const DATASETS_BUILD_ARGV_SCHEMA: readonly NpmArgvField[] = [
  { flag: "--input-dir" },
  { flag: "--output" },
];

export const FIXTURES_BATCH_ARGV_SCHEMA: readonly NpmArgvField[] = [
  { flag: "--input-dir" },
  { flag: "--output-dir" },
  { flag: "--summary" },
];

export const RESEARCH_REGISTRY_ARGV_SCHEMA: readonly NpmArgvField[] = [
  { flag: "--input-dir" },
  { flag: "--metadata-dir" },
  { flag: "--output-dir" },
];

export const RESEARCH_AGGREGATE_ARGV_SCHEMA: readonly NpmArgvField[] = [
  { flag: "--input-dir" },
  { flag: "--output-dir" },
];

export const RESEARCH_CALIBRATION_ARGV_SCHEMA: readonly NpmArgvField[] = [
  { flag: "--input-dir" },
  { flag: "--output-dir" },
];

export const RESEARCH_INSPECT_ARGV_SCHEMA: readonly NpmArgvField[] = [
  { flag: "--input" },
  { flag: "--input-dir" },
  { flag: "--strategy" },
  { flag: "--limit" },
];

export const RESEARCH_REPORT_ARGV_SCHEMA: readonly NpmArgvField[] = [
  { flag: "--input-dir" },
  { flag: "--leaderboard" },
  { flag: "--output" },
];

export const MISPRICING_ATLAS_ARGV_SCHEMA: readonly NpmArgvField[] = [
  { flag: "--input-dir" },
  { flag: "--output" },
];

export const LEAD_LAG_ARGV_SCHEMA: readonly NpmArgvField[] = [
  { flag: "--input-dir" },
  { flag: "--output" },
];

export const DECISION_TRACE_ATTRIBUTION_ARGV_SCHEMA: readonly NpmArgvField[] = [
  { flag: "--input-dir" },
  { flag: "--output" },
];

export const STATISTICAL_SIGNIFICANCE_ARGV_SCHEMA: readonly NpmArgvField[] = [
  { flag: "--input-dir" },
  { flag: "--output" },
  { flag: "--seed" },
  { flag: "--simulations" },
];

export const REGIME_TAGGING_ARGV_SCHEMA: readonly NpmArgvField[] = [
  { flag: "--input-dir" },
  { flag: "--output" },
];

export const VOL_PREMIUM_ARGV_SCHEMA: readonly NpmArgvField[] = [
  { flag: "--input-dir" },
  { flag: "--output" },
];

export const EVENT_STUDY_ARGV_SCHEMA: readonly NpmArgvField[] = [
  { flag: "--events" },
  { flag: "--input-dir" },
  { flag: "--output" },
];

export const POWER_ANALYSIS_ARGV_SCHEMA: readonly NpmArgvField[] = [
  { flag: "--input-dir" },
  { flag: "--output" },
];

export const HYPOTHESIS_CANDIDATES_ARGV_SCHEMA: readonly NpmArgvField[] = [
  { flag: "--output" },
  { flag: "--mispricing-atlas" },
  { flag: "--lead-lag" },
  { flag: "--significance" },
  { flag: "--regime-tags" },
  { flag: "--leaderboard" },
  { flag: "--min-sample" },
];

export const OVERFITTING_DIAGNOSTICS_ARGV_SCHEMA: readonly NpmArgvField[] = [
  { flag: "--input-dir" },
  { flag: "--experiments-root" },
  { flag: "--output" },
];

export const RESEARCH_PIPELINE_ARGV_SCHEMA: readonly NpmArgvField[] = [
  { flag: "--series" },
  { flag: "--limit" },
  { flag: "--concurrency" },
  { flag: "--rank-by" },
  { flag: "--output" },
  { flag: "--discovery-output" },
  { flag: "--continue-on-error" },
  { flag: "--adaptive-throttle" },
  { flag: "--no-adaptive-throttle" },
  { flag: "--min-request-delay-ms" },
  { flag: "--max-request-delay-ms" },
  { flag: "--request-delay-ms" },
];

export const LEADERBOARD_STRATEGIES_ARGV_SCHEMA: readonly NpmArgvField[] = [
  { flag: "--input-dir" },
  { flag: "--output" },
  { flag: "--rank-by" },
];

export const EXPERIMENTS_REGISTER_ARGV_SCHEMA: readonly NpmArgvField[] = [
  { flag: "--research-root" },
  { flag: "--experiments-root" },
  { flag: "--fixtures-root" },
];

export const WALK_FORWARD_VALIDATION_ARGV_SCHEMA: readonly NpmArgvField[] = [
  { flag: "--registry" },
  { flag: "--output-dir" },
  { flag: "--config" },
];

export const PARAMETER_SWEEP_ARGV_SCHEMA: readonly NpmArgvField[] = [
  { flag: "--config" },
  { flag: "--registry" },
  { flag: "--output-dir" },
  { flag: "--concurrency" },
  { flag: "--summary" },
];

const STRATEGY_SWEEP_POSITIONAL_SCHEMA: readonly NpmArgvField[] = [
  { flag: "--registry" },
  { flag: "--output-dir" },
  { flag: "--concurrency" },
  { flag: "--summary" },
];

const WALK_FORWARD_SWEEP_POSITIONAL_SCHEMA: readonly NpmArgvField[] = [
  { flag: "--split-id" },
  { flag: "--split-input-dir" },
  { flag: "--output-dir" },
  { flag: "--concurrency" },
];

function normalizeStrategySelectionArgv(
  argv: readonly string[],
  positionalSchema: readonly NpmArgvField[],
): string[] {
  const expanded = expandEqualsStyleFlags(argv);

  if (hasCliFlags(expanded)) {
    return mergeNpmBooleanFlags(expanded, ["--all"]);
  }

  const booleanMerged = mergeNpmBooleanFlags(expanded, ["--all"]);
  if (booleanMerged.some((token) => token === "--all")) {
    return booleanMerged;
  }

  if (expanded.length === 1) {
    return ["--strategy", expanded[0]];
  }

  const positional = mapPositionalToFlags(expanded, positionalSchema);
  return mergeNpmBooleanFlags(positional, ["--all"]);
}

export function normalizeDiscoveryImportConfigsArgv(argv: readonly string[]): string[] {
  return normalizeNpmScriptArgv(argv, DISCOVERY_IMPORT_CONFIGS_ARGV_SCHEMA);
}

export function normalizeImportBatchArgv(argv: readonly string[]): string[] {
  const expanded = expandEqualsStyleFlags(argv);

  if (hasCliFlags(expanded)) {
    return mergeNpmBooleanFlags(expanded, ["--overwrite", "--adaptive-throttle"]);
  }

  return mergeNpmBooleanFlags(
    normalizeNpmScriptArgv(argv, IMPORT_BATCH_ARGV_SCHEMA),
    ["--overwrite", "--adaptive-throttle"],
  );
}

export function normalizeImportAnalyzeFailuresArgv(argv: readonly string[]): string[] {
  return normalizeNpmScriptArgv(argv, IMPORT_ANALYZE_FAILURES_ARGV_SCHEMA);
}

export function normalizeDataAuditBidAskArgv(argv: readonly string[]): string[] {
  return normalizeNpmScriptArgv(argv, DATA_AUDIT_BID_ASK_ARGV_SCHEMA);
}

export function normalizeDebugSettlementTraceArgv(argv: readonly string[]): string[] {
  return normalizeNpmScriptArgv(argv, DEBUG_SETTLEMENT_TRACE_ARGV_SCHEMA);
}

export function normalizeDatasetsBuildArgv(argv: readonly string[]): string[] {
  return normalizeNpmScriptArgv(argv, DATASETS_BUILD_ARGV_SCHEMA);
}

export function normalizeFixturesBatchArgv(argv: readonly string[]): string[] {
  return normalizeNpmScriptArgv(argv, FIXTURES_BATCH_ARGV_SCHEMA);
}

export function normalizeResearchRegistryArgv(argv: readonly string[]): string[] {
  return normalizeNpmScriptArgv(argv, RESEARCH_REGISTRY_ARGV_SCHEMA);
}

export function normalizeResearchAggregateArgv(argv: readonly string[]): string[] {
  return normalizeNpmScriptArgv(argv, RESEARCH_AGGREGATE_ARGV_SCHEMA);
}

export function normalizeResearchCalibrationArgv(argv: readonly string[]): string[] {
  return normalizeNpmScriptArgv(argv, RESEARCH_CALIBRATION_ARGV_SCHEMA);
}

export function normalizeResearchInspectArgv(argv: readonly string[]): string[] {
  return normalizeNpmScriptArgv(argv, RESEARCH_INSPECT_ARGV_SCHEMA);
}

export function normalizeResearchReportArgv(argv: readonly string[]): string[] {
  return normalizeNpmScriptArgv(argv, RESEARCH_REPORT_ARGV_SCHEMA);
}

export function normalizeMispricingAtlasArgv(argv: readonly string[]): string[] {
  return normalizeNpmScriptArgv(argv, MISPRICING_ATLAS_ARGV_SCHEMA);
}

export function normalizeLeadLagArgv(argv: readonly string[]): string[] {
  return normalizeNpmScriptArgv(argv, LEAD_LAG_ARGV_SCHEMA);
}

export function normalizeDecisionTraceAttributionArgv(argv: readonly string[]): string[] {
  return normalizeNpmScriptArgv(argv, DECISION_TRACE_ATTRIBUTION_ARGV_SCHEMA);
}

export function normalizeStatisticalSignificanceArgv(argv: readonly string[]): string[] {
  return normalizeNpmScriptArgv(argv, STATISTICAL_SIGNIFICANCE_ARGV_SCHEMA);
}

export function normalizeRegimeTaggingArgv(argv: readonly string[]): string[] {
  return normalizeNpmScriptArgv(argv, REGIME_TAGGING_ARGV_SCHEMA);
}

export function normalizeVolPremiumArgv(argv: readonly string[]): string[] {
  return normalizeNpmScriptArgv(argv, VOL_PREMIUM_ARGV_SCHEMA);
}

export function normalizeEventStudyArgv(argv: readonly string[]): string[] {
  return normalizeNpmScriptArgv(argv, EVENT_STUDY_ARGV_SCHEMA);
}


export function normalizeHypothesisCandidatesArgv(argv: readonly string[]): string[] {
  return normalizeNpmScriptArgv(argv, HYPOTHESIS_CANDIDATES_ARGV_SCHEMA);
}

export function normalizePowerAnalysisArgv(argv: readonly string[]): string[] {
  return normalizeNpmScriptArgv(argv, POWER_ANALYSIS_ARGV_SCHEMA);
}

export function normalizeOverfittingDiagnosticsArgv(argv: readonly string[]): string[] {
  return normalizeNpmScriptArgv(argv, OVERFITTING_DIAGNOSTICS_ARGV_SCHEMA);
}


export function normalizeLeaderboardStrategiesArgv(argv: readonly string[]): string[] {
  return normalizeNpmScriptArgv(argv, LEADERBOARD_STRATEGIES_ARGV_SCHEMA);
}

export function normalizeExperimentsRegisterArgv(argv: readonly string[]): string[] {
  return normalizeNpmScriptArgv(argv, EXPERIMENTS_REGISTER_ARGV_SCHEMA);
}

export function normalizeWalkForwardValidationArgv(argv: readonly string[]): string[] {
  return normalizeNpmScriptArgv(argv, WALK_FORWARD_VALIDATION_ARGV_SCHEMA);
}

export function normalizeStrategySweepArgv(argv: readonly string[]): string[] {
  return normalizeStrategySelectionArgv(argv, STRATEGY_SWEEP_POSITIONAL_SCHEMA);
}

export function normalizeWalkForwardSweepArgv(argv: readonly string[]): string[] {
  return normalizeStrategySelectionArgv(argv, WALK_FORWARD_SWEEP_POSITIONAL_SCHEMA);
}

export function normalizeParameterSweepArgv(argv: readonly string[]): string[] {
  return normalizeNpmScriptArgv(argv, PARAMETER_SWEEP_ARGV_SCHEMA);
}

export function normalizeResearchPipelineArgv(argv: readonly string[]): string[] {
  return mergeNpmBooleanFlags(
    normalizeNpmScriptArgv(argv, RESEARCH_PIPELINE_ARGV_SCHEMA),
    ["--continue-on-error", "--adaptive-throttle", "--no-adaptive-throttle"],
  );
}
