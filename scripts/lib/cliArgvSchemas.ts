import {
  expandEqualsStyleFlags,
  hasCliFlags,
  mapPositionalToFlags,
  mergeNpmBooleanFlags,
  mergeNpmConfigFlags,
  normalizeNpmScriptArgv,
  readNpmConfigEnv,
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
  { flag: "--memory-report" },
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
  { flag: "--html-output" },
  { flag: "--mispricing-atlas" },
  { flag: "--lead-lag" },
  { flag: "--significance" },
  { flag: "--regime-tags" },
  { flag: "--leaderboard" },
  { flag: "--min-sample" },
  { flag: "--min-unique-days" },
  { flag: "--research-input-root" },
  { flag: "--memory-report" },
];

export const HYPOTHESIS_VALIDATION_ARGV_SCHEMA: readonly NpmArgvField[] = [
  { flag: "--output" },
  { flag: "--html-output" },
  { flag: "--input" },
  { flag: "--hypothesis-candidates" },
  { flag: "--mispricing-atlas" },
  { flag: "--research-results-dir" },
  { flag: "--regime-tags" },
  { flag: "--memory-report" },
];

export const STRATEGY_SYNTHESIS_ARGV_SCHEMA: readonly NpmArgvField[] = [
  { flag: "--output" },
  { flag: "--hypothesis-candidates" },
  { flag: "--hypothesis-validation" },
];

export const STRATEGY_HARNESS_ARGV_SCHEMA: readonly NpmArgvField[] = [
  { flag: "--input" },
  { flag: "--synthesis" },
  { flag: "--registry-dir" },
  { flag: "--output-dir" },
  { flag: "--family" },
  { flag: "--strategy-id" },
  { flag: "--concurrency" },
  { flag: "--include-rejected" },
  { flag: "--research-only-backtest" },
  { flag: "--failure-analysis" },
];

export const HARNESS_RESULTS_ARGV_SCHEMA: readonly NpmArgvField[] = [
  { flag: "--output" },
  { flag: "--html-output" },
  { flag: "--synthesis" },
  { flag: "--harness-summary" },
  { flag: "--harness-dir" },
  { flag: "--hypothesis-validation" },
  { flag: "--leaderboard" },
];

export const CANDIDATE_PROMOTION_ARGV_SCHEMA: readonly NpmArgvField[] = [
  { flag: "--output" },
  { flag: "--html-output" },
  { flag: "--hypothesis-validation" },
  { flag: "--strategy-synthesis" },
  { flag: "--harness-results" },
  { flag: "--harness-summary" },
  { flag: "--statistical-significance" },
];

export const RESEARCH_CANDIDATE_REGISTRY_ARGV_SCHEMA: readonly NpmArgvField[] = [
  { flag: "--output" },
  { flag: "--html-output" },
  { flag: "--hypothesis-candidates" },
  { flag: "--hypothesis-validation" },
  { flag: "--strategy-synthesis" },
  { flag: "--harness-results" },
  { flag: "--harness-summary" },
];

export const RESEARCH_CROSS_VALIDATION_ARGV_SCHEMA: readonly NpmArgvField[] = [
  { flag: "--output" },
  { flag: "--html-output" },
  { flag: "--hypothesis-candidates" },
  { flag: "--hypothesis-validation" },
  { flag: "--strategy-synthesis" },
  { flag: "--research-results-dir" },
  { flag: "--regime-tags" },
  { flag: "--rolling-window-months" },
  { flag: "--bootstrap-iterations" },
  { flag: "--bootstrap-seed" },
];

export const RESEARCH_COVERAGE_AWARE_VALIDATION_ARGV_SCHEMA: readonly NpmArgvField[] = [
  { flag: "--output" },
  { flag: "--html-output" },
  { flag: "--hypothesis-validation" },
  { flag: "--cross-validation" },
  { flag: "--historical-coverage-plan" },
  { flag: "--hypothesis-candidates" },
];

export const HYPOTHESIS_FAILURE_ANALYSIS_ARGV_SCHEMA: readonly NpmArgvField[] = [
  { flag: "--output" },
  { flag: "--html-output" },
  { flag: "--hypothesis-candidates" },
  { flag: "--hypothesis-validation" },
  { flag: "--mispricing-atlas" },
  { flag: "--coverage-aware-validation" },
  { flag: "--cross-validation" },
  { flag: "--hypothesis-history" },
];

export const DERIVED_SETTLEMENT_SENSITIVITY_ARGV_SCHEMA: readonly NpmArgvField[] = [
  { flag: "--output" },
  { flag: "--html-output" },
  { flag: "--hypothesis-candidates" },
  { flag: "--hypothesis-validation" },
  { flag: "--research-results-dir" },
  { flag: "--regime-tags" },
];

export const HYPOTHESIS_REFINEMENTS_ARGV_SCHEMA: readonly NpmArgvField[] = [
  { flag: "--output" },
  { flag: "--html-output" },
  { flag: "--hypothesis-failure-analysis" },
  { flag: "--hypothesis-validation" },
  { flag: "--mispricing-atlas" },
  { flag: "--cross-validation" },
];

export const RESEARCH_ROI_ANALYSIS_ARGV_SCHEMA: readonly NpmArgvField[] = [
  { flag: "--output" },
  { flag: "--html-output" },
  { flag: "--hypothesis-candidates" },
  { flag: "--hypothesis-validation" },
  { flag: "--hypothesis-failure-analysis" },
  { flag: "--hypothesis-refinements" },
  { flag: "--refinement-hypothesis-candidates" },
  { flag: "--mispricing-atlas" },
];

export const HYPOTHESIS_TRADE_REPLAY_ARGV_SCHEMA: readonly NpmArgvField[] = [
  { flag: "--output" },
  { flag: "--html-output" },
  { flag: "--input" },
  { flag: "--hypothesis-candidates" },
  { flag: "--atlas" },
  { flag: "--mispricing-atlas" },
  { flag: "--cost-aware-atlas" },
  { flag: "--research-results-dir" },
  { flag: "--regime-tags" },
  { flag: "--max-spread-cents" },
  { flag: "--min-net-edge-cents" },
  { flag: "--slippage-buffer-cents" },
  { flag: "--execution-mode" },
  { flag: "--official-only" },
];

export const REGISTER_REFINEMENT_HYPOTHESES_ARGV_SCHEMA: readonly NpmArgvField[] = [
  { flag: "--output" },
  { flag: "--html-output" },
  { flag: "--hypothesis-refinements" },
  { flag: "--hypothesis-candidates" },
  { flag: "--hypothesis-failure-analysis" },
];

export const STRATEGY_SYNTHESIS_DEBUG_ARGV_SCHEMA: readonly NpmArgvField[] = [
  { flag: "--output" },
  { flag: "--html-output" },
  { flag: "--hypothesis-candidates" },
  { flag: "--hypothesis-validation" },
  { flag: "--strategy-synthesis" },
  { flag: "--harness-summary" },
  { flag: "--harness-results" },
];

export const MONTH_REGIME_ANALYSIS_ARGV_SCHEMA: readonly NpmArgvField[] = [
  { flag: "--output" },
  { flag: "--html-output" },
  { flag: "--hypothesis-candidates" },
  { flag: "--hypothesis-validation" },
  { flag: "--regime-tags" },
  { flag: "--research-results-dir" },
];

export const DIMENSION_INTERACTION_ANALYTICS_ARGV_SCHEMA: readonly NpmArgvField[] = [
  { flag: "--output" },
  { flag: "--html-output" },
  { flag: "--hypothesis-candidates" },
  { flag: "--hypothesis-validation" },
  { flag: "--mispricing-atlas" },
  { flag: "--hypothesis-failure-analysis" },
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
  { flag: "--strict-dependencies" },
  { flag: "--adaptive-throttle" },
  { flag: "--no-adaptive-throttle" },
  { flag: "--min-request-delay-ms" },
  { flag: "--max-request-delay-ms" },
  { flag: "--request-delay-ms" },
];

export const FULL_RESEARCH_ORCHESTRATOR_ARGV_SCHEMA: readonly NpmArgvField[] = [
  { flag: "--output" },
  { flag: "--continue-on-error" },
  { flag: "--execute-expansion-import" },
  { flag: "--max-markets" },
  { flag: "--job-id" },
  { flag: "--resume" },
];

export const GENERATE_EXPANSION_IMPORT_CONFIG_ARGV_SCHEMA: readonly NpmArgvField[] = [
  { flag: "--input" },
  { flag: "--output" },
  { flag: "--html-output" },
  { flag: "--import-configs-dir" },
  { flag: "--dry-run" },
];

export const REBUILD_AFTER_EXPANSION_ARGV_SCHEMA: readonly NpmArgvField[] = [
  { flag: "--input" },
  { flag: "--output" },
  { flag: "--html-output" },
  { flag: "--fixtures-dir" },
  { flag: "--imports-dir" },
  { flag: "--import-configs-dir" },
  { flag: "--registry-dir" },
  { flag: "--research-results-dir" },
  { flag: "--mispricing-atlas" },
  { flag: "--concurrency" },
  { flag: "--full-rebuild" },
];

export const EXECUTE_EXPANSION_IMPORT_ARGV_SCHEMA: readonly NpmArgvField[] = [
  { flag: "--input" },
  { flag: "--output" },
  { flag: "--html-output" },
  { flag: "--import-configs-dir" },
  { flag: "--imports-dir" },
  { flag: "--fixtures-dir" },
  { flag: "--research-results-dir" },
  { flag: "--checkpoint-path" },
  { flag: "--summary-input" },
  { flag: "--max-markets" },
  { flag: "--max-retries" },
  { flag: "--rate-limit-backoff-ms" },
  { flag: "--max-rate-limit-retries" },
  { flag: "--min-backoff-ms" },
  { flag: "--max-backoff-ms" },
  { flag: "--backoff-multiplier" },
  { flag: "--success-decay-after" },
  { flag: "--sample-strategy" },
  { flag: "--job-id" },
  { flag: "--force-market" },
  { flag: "--trace-market" },
  { flag: "--market-ticker" },
  { flag: "--single-market-output" },
  { flag: "--single-market-html-output" },
  { flag: "--adaptive-throttle" },
  { flag: "--discovery-cache-dir" },
  { flag: "--discovery-cache-segment" },
  { flag: "--discovery-cache-ttl-hours" },
  { flag: "--refresh-discovery-cache" },
  { flag: "--refresh-discovery-month" },
  { flag: "--use-discovery-cache" },
  { flag: "--batch-plan" },
  { flag: "--execute" },
  { flag: "--resume" },
  { flag: "--skip-failed" },
];

export const PLAN_EXPANSION_BATCH_ARGV_SCHEMA: readonly NpmArgvField[] = [
  { flag: "--output" },
  { flag: "--html-output" },
  { flag: "--max-markets" },
  { flag: "--selection-strategy" },
  { flag: "--selection-seed" },
  { flag: "--historical-coverage-plan" },
  { flag: "--historical-expansion-config" },
  { flag: "--historical-expansion-import-summary" },
  { flag: "--hypothesis-validation" },
  { flag: "--coverage-aware-validation" },
  { flag: "--discovery-result" },
];

export const DATA_HEALTH_ARGV_SCHEMA: readonly NpmArgvField[] = [
  { flag: "--discovery-result" },
  { flag: "--imports-dir" },
  { flag: "--import-configs-dir" },
  { flag: "--fixtures-dir" },
  { flag: "--registry-dir" },
  { flag: "--research-results-dir" },
  { flag: "--leaderboard" },
  { flag: "--report-html" },
  { flag: "--output" },
];

export const HISTORICAL_COVERAGE_PLAN_ARGV_SCHEMA: readonly NpmArgvField[] = [
  { flag: "--output" },
  { flag: "--html-output" },
  { flag: "--data-health" },
  { flag: "--mispricing-atlas" },
  { flag: "--hypothesis-validation" },
  { flag: "--regime-tags" },
  { flag: "--expansion-import-summary" },
  { flag: "--import-configs-dir" },
  { flag: "--fixtures-dir" },
  { flag: "--research-results-dir" },
  { flag: "--month-persistence-threshold" },
  { flag: "--min-markets-per-month" },
  { flag: "--min-trading-days-per-month" },
  { flag: "--earliest-month" },
];

const HISTORICAL_COVERAGE_PLAN_NPM_CONFIG_FLAGS = [
  "--output",
  "--html-output",
  "--data-health",
  "--mispricing-atlas",
  "--hypothesis-validation",
  "--regime-tags",
  "--expansion-import-summary",
  "--import-configs-dir",
  "--fixtures-dir",
  "--research-results-dir",
  "--month-persistence-threshold",
  "--min-markets-per-month",
  "--min-trading-days-per-month",
  "--earliest-month",
] as const;

export const HYPOTHESIS_LIFECYCLE_ARGV_SCHEMA: readonly NpmArgvField[] = [
  { flag: "--output" },
  { flag: "--hypothesis-candidates" },
  { flag: "--evidence-html" },
  { flag: "--hypothesis-validation" },
  { flag: "--strategy-synthesis" },
  { flag: "--harness-summary" },
  { flag: "--harness-dir" },
];

export const HYPOTHESIS_HISTORY_ARGV_SCHEMA: readonly NpmArgvField[] = [
  { flag: "--output" },
  { flag: "--html-output" },
  { flag: "--hypothesis-candidates" },
  { flag: "--hypothesis-validation" },
  { flag: "--coverage-validation" },
  { flag: "--mispricing-atlas" },
];

export const RESEARCH_ARTIFACT_INDEX_ARGV_SCHEMA: readonly NpmArgvField[] = [
  { flag: "--discovery-result" },
  { flag: "--imports-dir" },
  { flag: "--import-configs-dir" },
  { flag: "--fixtures-dir" },
  { flag: "--registry-dir" },
  { flag: "--research-results-dir" },
  { flag: "--leaderboard" },
  { flag: "--report-html" },
  { flag: "--output" },
  { flag: "--html-output" },
];

export const RESEARCH_PERFORMANCE_AUDIT_ARGV_SCHEMA: readonly NpmArgvField[] = [
  { flag: "--output" },
  { flag: "--html-output" },
  { flag: "--full-research-summary" },
  { flag: "--artifact-index" },
  { flag: "--historical-coverage-plan" },
  { flag: "--experiment-index" },
];

export const EXPANSION_IMPORT_PERFORMANCE_AUDIT_ARGV_SCHEMA: readonly NpmArgvField[] = [
  { flag: "--output" },
  { flag: "--html-output" },
  { flag: "--expansion-import-summary" },
  { flag: "--expansion-import-checkpoint" },
  { flag: "--import-configs-dir" },
  { flag: "--imports-dir" },
];

export const HISTORICAL_CORPUS_AUDIT_ARGV_SCHEMA: readonly NpmArgvField[] = [
  { flag: "--output" },
  { flag: "--html-output" },
  { flag: "--series" },
  { flag: "--coverage-plan" },
  { flag: "--expansion-import-summary" },
  { flag: "--discovery-result" },
  { flag: "--discovery-cache-dir" },
  { flag: "--expansion-batch-plan" },
];

export const EXPANSION_RUN_HISTORY_ARGV_SCHEMA: readonly NpmArgvField[] = [
  { flag: "--output" },
  { flag: "--html-output" },
  { flag: "--expansion-import-summary" },
  { flag: "--expansion-import-checkpoint" },
  { flag: "--expansion-rebuild-summary" },
  { flag: "--experiment-index" },
  { flag: "--import-configs-dir" },
  { flag: "--imports-dir" },
];

export const RESEARCH_WORKFLOW_ARGV_SCHEMA: readonly NpmArgvField[] = [
  { flag: "--output" },
  { flag: "--html-output" },
  { flag: "--hypothesis-failure-analysis" },
  { flag: "--derived-settlement-sensitivity" },
  { flag: "--hypothesis-refinements" },
  { flag: "--refinement-hypothesis-candidates" },
  { flag: "--strategy-synthesis-debug" },
  { flag: "--month-regime-analysis" },
  { flag: "--harness-summary" },
];

export const RESEARCH_DIMENSION_EXPLORER_ARGV_SCHEMA: readonly NpmArgvField[] = [
  { flag: "--output" },
  { flag: "--html-output" },
  { flag: "--mispricing-atlas" },
  { flag: "--hypothesis-candidates" },
  { flag: "--hypothesis-validation" },
];

export const RESEARCH_RECOMMENDATION_ENGINE_ARGV_SCHEMA: readonly NpmArgvField[] = [
  { flag: "--output" },
  { flag: "--html-output" },
  { flag: "--portfolio-analytics" },
  { flag: "--roi-analysis" },
  { flag: "--interaction-analysis" },
  { flag: "--dimension-explorer" },
  { flag: "--failure-analysis" },
  { flag: "--month-regime-analysis" },
];

export const FEATURE_CATALOG_EXPLORER_ARGV_SCHEMA: readonly NpmArgvField[] = [
  { flag: "--output" },
  { flag: "--html-output" },
  { flag: "--dimension-explorer" },
  { flag: "--portfolio-analytics" },
  { flag: "--roi-analysis" },
  { flag: "--duplication-analysis" },
];

export const RESEARCH_PIPELINE_DASHBOARD_ARGV_SCHEMA: readonly NpmArgvField[] = [
  { flag: "--output" },
  { flag: "--pipeline-summary" },
  { flag: "--full-research-summary" },
  { flag: "--artifact-index" },
  { flag: "--hypothesis-candidates" },
  { flag: "--hypothesis-validation" },
  { flag: "--strategy-synthesis" },
  { flag: "--harness-results" },
  { flag: "--harness-summary" },
  { flag: "--leaderboard" },
  { flag: "--data-health" },
  { flag: "--historical-coverage-plan" },
  { flag: "--historical-expansion-config" },
  { flag: "--coverage-validation" },
  { flag: "--historical-expansion-import-summary" },
  { flag: "--expansion-rebuild-summary" },
  { flag: "--hypothesis-history" },
  { flag: "--expansion-run-history" },
];

export const RESEARCH_EXPERIMENT_ARGV_SCHEMA: readonly NpmArgvField[] = [
  { flag: "--experiments-dir" },
  { flag: "--index-output" },
  { flag: "--html-output" },
  { flag: "--pipeline-summary" },
  { flag: "--full-research-summary" },
  { flag: "--hypothesis-candidates" },
  { flag: "--hypothesis-validation" },
  { flag: "--strategy-synthesis" },
  { flag: "--harness-results" },
  { flag: "--candidate-promotions" },
  { flag: "--artifact-index" },
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
  { flag: "--synthesis" },
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
    return mergeNpmBooleanFlags(expanded, ["--all", "--include-synthesized"]);
  }

  const booleanMerged = mergeNpmBooleanFlags(expanded, ["--all", "--include-synthesized"]);
  if (booleanMerged.some((token) => token === "--all")) {
    return booleanMerged;
  }

  if (expanded.length === 1) {
    return ["--strategy", expanded[0]];
  }

  const positional = mapPositionalToFlags(expanded, positionalSchema);
  return mergeNpmBooleanFlags(positional, ["--all", "--include-synthesized"]);
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
  return mergeNpmBooleanFlags(
    normalizeNpmScriptArgv(argv, HYPOTHESIS_CANDIDATES_ARGV_SCHEMA),
    ["--memory-report"],
  );
}

export function normalizeHypothesisValidationArgv(argv: readonly string[]): string[] {
  return mergeNpmBooleanFlags(
    normalizeNpmScriptArgv(argv, HYPOTHESIS_VALIDATION_ARGV_SCHEMA),
    ["--memory-report"],
  );
}

export function normalizeStrategySynthesisArgv(argv: readonly string[]): string[] {
  return normalizeNpmScriptArgv(argv, STRATEGY_SYNTHESIS_ARGV_SCHEMA);
}

export function normalizeStrategyHarnessArgv(argv: readonly string[]): string[] {
  return mergeNpmBooleanFlags(
    normalizeNpmScriptArgv(argv, STRATEGY_HARNESS_ARGV_SCHEMA),
    ["--include-rejected", "--research-only-backtest"],
  );
}

export function normalizeHarnessResultsArgv(argv: readonly string[]): string[] {
  return normalizeNpmScriptArgv(argv, HARNESS_RESULTS_ARGV_SCHEMA);
}

export function normalizeCandidatePromotionArgv(argv: readonly string[]): string[] {
  return normalizeNpmScriptArgv(argv, CANDIDATE_PROMOTION_ARGV_SCHEMA);
}

export function normalizeResearchCandidateRegistryArgv(argv: readonly string[]): string[] {
  return normalizeNpmScriptArgv(argv, RESEARCH_CANDIDATE_REGISTRY_ARGV_SCHEMA);
}

export function normalizeCrossValidationArgv(argv: readonly string[]): string[] {
  return normalizeNpmScriptArgv(argv, RESEARCH_CROSS_VALIDATION_ARGV_SCHEMA);
}

export function normalizeCoverageAwareValidationArgv(argv: readonly string[]): string[] {
  return normalizeNpmScriptArgv(argv, RESEARCH_COVERAGE_AWARE_VALIDATION_ARGV_SCHEMA);
}

export function normalizeHypothesisFailureAnalysisArgv(argv: readonly string[]): string[] {
  return normalizeNpmScriptArgv(argv, HYPOTHESIS_FAILURE_ANALYSIS_ARGV_SCHEMA);
}

export function normalizeDerivedSettlementSensitivityArgv(argv: readonly string[]): string[] {
  return normalizeNpmScriptArgv(argv, DERIVED_SETTLEMENT_SENSITIVITY_ARGV_SCHEMA);
}

export function normalizeHypothesisRefinementsArgv(argv: readonly string[]): string[] {
  return normalizeNpmScriptArgv(argv, HYPOTHESIS_REFINEMENTS_ARGV_SCHEMA);
}

export function normalizeResearchRoiAnalysisArgv(argv: readonly string[]): string[] {
  return normalizeNpmScriptArgv(argv, RESEARCH_ROI_ANALYSIS_ARGV_SCHEMA);
}

export function normalizeHypothesisTradeReplayArgv(argv: readonly string[]): string[] {
  return mergeNpmBooleanFlags(
    normalizeNpmScriptArgv(argv, HYPOTHESIS_TRADE_REPLAY_ARGV_SCHEMA),
    ["--official-only"],
  );
}

export function normalizeRegisterRefinementHypothesesArgv(argv: readonly string[]): string[] {
  return normalizeNpmScriptArgv(argv, REGISTER_REFINEMENT_HYPOTHESES_ARGV_SCHEMA);
}

export function normalizeStrategySynthesisDebugArgv(argv: readonly string[]): string[] {
  return normalizeNpmScriptArgv(argv, STRATEGY_SYNTHESIS_DEBUG_ARGV_SCHEMA);
}

export function normalizeMonthRegimeAnalysisArgv(argv: readonly string[]): string[] {
  return normalizeNpmScriptArgv(argv, MONTH_REGIME_ANALYSIS_ARGV_SCHEMA);
}

export function normalizeDimensionInteractionAnalyticsArgv(argv: readonly string[]): string[] {
  return normalizeNpmScriptArgv(argv, DIMENSION_INTERACTION_ANALYTICS_ARGV_SCHEMA);
}

export function normalizePowerAnalysisArgv(argv: readonly string[]): string[] {
  return normalizeNpmScriptArgv(argv, POWER_ANALYSIS_ARGV_SCHEMA);
}

export function normalizeOverfittingDiagnosticsArgv(argv: readonly string[]): string[] {
  return normalizeNpmScriptArgv(argv, OVERFITTING_DIAGNOSTICS_ARGV_SCHEMA);
}

export function normalizeDataHealthArgv(argv: readonly string[]): string[] {
  return normalizeNpmScriptArgv(argv, DATA_HEALTH_ARGV_SCHEMA);
}

export function normalizeHistoricalCoveragePlanArgv(argv: readonly string[]): string[] {
  const expanded = expandEqualsStyleFlags(argv);
  return hasCliFlags(expanded)
    ? mergeNpmConfigFlags(expanded, HISTORICAL_COVERAGE_PLAN_NPM_CONFIG_FLAGS)
    : mergeNpmConfigFlags(
        mapPositionalToFlags(expanded, HISTORICAL_COVERAGE_PLAN_ARGV_SCHEMA),
        HISTORICAL_COVERAGE_PLAN_NPM_CONFIG_FLAGS,
      );
}

export function normalizePlanExpansionBatchArgv(argv: readonly string[]): string[] {
  const expanded = expandEqualsStyleFlags(argv);
  const withConfigFlags = hasCliFlags(expanded)
    ? mergeNpmConfigFlags(expanded, PLAN_EXPANSION_BATCH_NPM_CONFIG_FLAGS)
    : mergeNpmConfigFlags(
        parsePositionalPlanExpansionBatchArgv(expanded),
        PLAN_EXPANSION_BATCH_NPM_CONFIG_FLAGS,
      );

  return attachTrailingMaxMarketsForPlanExpansionBatch(withConfigFlags);
}

export function normalizeHypothesisLifecycleArgv(argv: readonly string[]): string[] {
  return normalizeNpmScriptArgv(argv, HYPOTHESIS_LIFECYCLE_ARGV_SCHEMA);
}

export function normalizeHypothesisHistoryArgv(argv: readonly string[]): string[] {
  return normalizeNpmScriptArgv(argv, HYPOTHESIS_HISTORY_ARGV_SCHEMA);
}

export function normalizeResearchArtifactIndexArgv(argv: readonly string[]): string[] {
  return normalizeNpmScriptArgv(argv, RESEARCH_ARTIFACT_INDEX_ARGV_SCHEMA);
}

export function normalizeResearchPipelineDashboardArgv(argv: readonly string[]): string[] {
  return normalizeNpmScriptArgv(argv, RESEARCH_PIPELINE_DASHBOARD_ARGV_SCHEMA);
}

export function normalizeResearchPerformanceAuditArgv(argv: readonly string[]): string[] {
  return normalizeNpmScriptArgv(argv, RESEARCH_PERFORMANCE_AUDIT_ARGV_SCHEMA);
}

export function normalizeExpansionRunHistoryArgv(argv: readonly string[]): string[] {
  return normalizeNpmScriptArgv(argv, EXPANSION_RUN_HISTORY_ARGV_SCHEMA);
}

export function normalizeResearchWorkflowArgv(argv: readonly string[]): string[] {
  return normalizeNpmScriptArgv(argv, RESEARCH_WORKFLOW_ARGV_SCHEMA);
}

export function normalizeResearchDimensionExplorerArgv(
  argv: readonly string[],
): string[] {
  return normalizeNpmScriptArgv(argv, RESEARCH_DIMENSION_EXPLORER_ARGV_SCHEMA);
}

export function normalizeResearchRecommendationEngineArgv(
  argv: readonly string[],
): string[] {
  return normalizeNpmScriptArgv(argv, RESEARCH_RECOMMENDATION_ENGINE_ARGV_SCHEMA);
}

export function normalizeFeatureCatalogExplorerArgv(
  argv: readonly string[],
): string[] {
  return normalizeNpmScriptArgv(argv, FEATURE_CATALOG_EXPLORER_ARGV_SCHEMA);
}

export function normalizeExpansionImportPerformanceAuditArgv(
  argv: readonly string[],
): string[] {
  return normalizeNpmScriptArgv(argv, EXPANSION_IMPORT_PERFORMANCE_AUDIT_ARGV_SCHEMA);
}

export function normalizeHistoricalCorpusAuditArgv(argv: readonly string[]): string[] {
  return normalizeNpmScriptArgv(argv, HISTORICAL_CORPUS_AUDIT_ARGV_SCHEMA);
}

export function normalizeFullResearchOrchestratorArgv(argv: readonly string[]): string[] {
  return mergeNpmBooleanFlags(
    normalizeNpmScriptArgv(argv, FULL_RESEARCH_ORCHESTRATOR_ARGV_SCHEMA),
    ["--continue-on-error", "--execute-expansion-import", "--resume"],
  );
}

export function normalizeResearchExperimentArgv(argv: readonly string[]): string[] {
  return normalizeNpmScriptArgv(argv, RESEARCH_EXPERIMENT_ARGV_SCHEMA);
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
    ["--continue-on-error", "--strict-dependencies", "--adaptive-throttle", "--no-adaptive-throttle"],
  );
}

export function normalizeGenerateExpansionImportConfigArgv(
  argv: readonly string[],
): string[] {
  return mergeNpmBooleanFlags(
    normalizeNpmScriptArgv(argv, GENERATE_EXPANSION_IMPORT_CONFIG_ARGV_SCHEMA),
    ["--dry-run"],
  );
}

export function normalizeRebuildAfterExpansionArgv(argv: readonly string[]): string[] {
  return mergeNpmBooleanFlags(
    normalizeNpmScriptArgv(argv, REBUILD_AFTER_EXPANSION_ARGV_SCHEMA),
    ["--full-rebuild"],
  );
}

const EXECUTE_EXPANSION_IMPORT_NPM_CONFIG_FLAGS = [
  "--input",
  "--output",
  "--html-output",
  "--import-configs-dir",
  "--imports-dir",
  "--fixtures-dir",
  "--research-results-dir",
  "--checkpoint-path",
  "--summary-input",
  "--max-markets",
  "--max-retries",
  "--rate-limit-backoff-ms",
  "--max-rate-limit-retries",
  "--min-backoff-ms",
  "--max-backoff-ms",
  "--backoff-multiplier",
  "--success-decay-after",
  "--sample-strategy",
  "--job-id",
  "--force-market",
  "--market-ticker",
  "--single-market-output",
  "--single-market-html-output",
  "--batch-plan",
] as const;

const EXECUTE_EXPANSION_IMPORT_BOOLEAN_FLAGS = [
  "--execute",
  "--resume",
  "--skip-failed",
  "--adaptive-throttle",
  "--retry-failed",
  "--retry-unsupported",
  "--verify-resume-artifacts",
  "--allow-derived-expiration-value",
] as const;

const PLAN_EXPANSION_BATCH_NPM_CONFIG_FLAGS = [
  "--output",
  "--html-output",
  "--max-markets",
  "--selection-strategy",
  "--selection-seed",
  "--historical-coverage-plan",
  "--historical-expansion-config",
  "--historical-expansion-import-summary",
  "--hypothesis-validation",
  "--coverage-aware-validation",
  "--discovery-result",
] as const;

function parsePositionalPlanExpansionBatchArgv(argv: readonly string[]): string[] {
  const positional = argv.filter((token) => !token.startsWith("-"));
  if (positional.length === 0) {
    return [...argv];
  }

  const [maxMarketsToken, ...restPositional] = positional;
  if (!maxMarketsToken || !isIntegerToken(maxMarketsToken)) {
    return [...argv];
  }

  const withoutPositional = argv.filter((token) => !positional.includes(token));
  return ["--max-markets", maxMarketsToken, ...withoutPositional, ...restPositional];
}

function attachTrailingMaxMarketsForPlanExpansionBatch(argv: readonly string[]): string[] {
  if (argv.includes("--max-markets")) {
    return [...argv];
  }

  const merged = [...argv];
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!isIntegerToken(token)) {
      continue;
    }

    const previous = argv[index - 1];
    if (previous === "--max-markets") {
      continue;
    }

    if (previous?.startsWith("--")) {
      merged.push("--max-markets", token);
      break;
    }
  }

  return merged;
}

function looksLikeExpansionImportConfigPath(token: string): boolean {
  return token.endsWith(".json") || token.includes("/") || token.includes("\\");
}

function isIntegerToken(token: string): boolean {
  return /^\d+$/.test(token.trim());
}

function appendFlag(
  normalized: string[],
  flag: string,
  value: string | undefined,
): void {
  if (value !== undefined) {
    normalized.push(flag, value);
  }
}

function parsePositionalExecuteExpansionImportArgv(argv: readonly string[]): string[] {
  if (argv.length === 0) {
    return [];
  }

  const normalized: string[] = [];
  let inputPath: string | undefined;
  let maxMarkets: string | undefined;

  for (const token of argv) {
    if (looksLikeExpansionImportConfigPath(token)) {
      inputPath = token;
      continue;
    }

    if (isIntegerToken(token)) {
      maxMarkets = token;
      continue;
    }
  }

  appendFlag(normalized, "--input", inputPath);
  appendFlag(normalized, "--max-markets", maxMarkets);
  return normalized;
}

function attachTrailingMaxMarkets(argv: readonly string[]): string[] {
  if (argv.includes("--max-markets")) {
    return [...argv];
  }

  const configValue = readNpmConfigEnv("--max-markets");
  if (configValue && configValue !== "true") {
    return [...argv, "--max-markets", configValue];
  }

  const merged = [...argv];
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!isIntegerToken(token)) {
      continue;
    }

    const previous = argv[index - 1];
    if (previous === "--max-markets") {
      continue;
    }

    if (previous?.startsWith("--")) {
      merged.push("--max-markets", token);
      break;
    }
  }

  return merged;
}

export function normalizeExecuteExpansionImportArgv(argv: readonly string[]): string[] {
  const expanded = expandEqualsStyleFlags(argv);
  const withConfigFlags = hasCliFlags(expanded)
    ? mergeNpmConfigFlags(expanded, EXECUTE_EXPANSION_IMPORT_NPM_CONFIG_FLAGS)
    : mergeNpmConfigFlags(
        parsePositionalExecuteExpansionImportArgv(expanded),
        EXECUTE_EXPANSION_IMPORT_NPM_CONFIG_FLAGS,
      );

  return mergeNpmBooleanFlags(
    attachTrailingMaxMarkets(withConfigFlags),
    EXECUTE_EXPANSION_IMPORT_BOOLEAN_FLAGS,
  );
}
