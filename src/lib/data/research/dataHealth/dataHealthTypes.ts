export const DATA_HEALTH_FILENAME = "data-health.json";
export const DEFAULT_DATA_HEALTH_OUTPUT_PATH = "data/research-results/data-health.json";
export const DEFAULT_DISCOVERY_RESULT_PATH = "discovery-result.json";
export const DEFAULT_IMPORTS_DIR = "data/imports";
export const DEFAULT_IMPORT_CONFIGS_DIR = "data/import-configs";
export const DEFAULT_FIXTURES_DIR = "data/fixtures";
export const DEFAULT_REGISTRY_DIR = "data/research-datasets";
export const DEFAULT_RESEARCH_RESULTS_DIR = "data/research-results";
export const DEFAULT_LEADERBOARD_PATH = "data/leaderboards/strategy-leaderboard.json";
export const DEFAULT_REPORT_HTML_PATH = "data/reports/research-report.html";

export const MISPRICING_ATLAS_ARTIFACT = "mispricing-atlas.json";
export const LEAD_LAG_ARTIFACT = "lead-lag-analysis.json";
export const SIGNIFICANCE_ARTIFACT = "statistical-significance.json";
export const POWER_ANALYSIS_ARTIFACT = "power-analysis.json";
export const OVERFITTING_DIAGNOSTICS_ARTIFACT = "overfitting-diagnostics.json";
export const REGIME_TAGS_ARTIFACT = "regime-tags.json";
export const HYPOTHESIS_CANDIDATES_ARTIFACT = "hypothesis-candidates.json";
export const SETTLEMENT_AUDIT_ARTIFACT = "settlement-audit.json";

export const IMPORT_CONFIG_FILENAME = "config.json";
export const FIXTURE_FILENAME = "fixture.json";
export const REGISTRY_FILENAME = "dataset-registry.json";
export const RESEARCH_OUTPUT_FILENAME = "research-output.json";
export const AGGREGATE_SUMMARY_FILENAME = "aggregate-summary.json";
export const CALIBRATION_REPORT_FILENAME = "calibration-report.json";
export const BATCH_IMPORT_SUMMARY_FILENAME = "batch-import-summary.json";

export const MAX_MISSING_SETTLEMENT_EXAMPLES = 10;

export type StageStatusColor = "green" | "yellow" | "red";

export type DataHealthStageStatus = {
  stageId: string;
  stageLabel: string;
  status: StageStatusColor;
  reason: string;
  requiredAction: string;
};

export type PipelineCoverage = {
  discoveredMarkets: number | null;
  importConfigs: number;
  successfulImports: number | null;
  failedImports: number | null;
  fixtures: number;
  registryMarkets: number;
  researchOutputs: number;
  aggregateSummaries: number;
  calibrationReports: number;
  leaderboardPresent: boolean;
  reportHtmlPresent: boolean;
};

export type SettlementHealth = {
  settlementPresent: number;
  settlementMissing: number;
  settlementCoveragePct: number | null;
  missingSettlementExamples: readonly string[];
  reasonCounts: Readonly<Record<string, number>>;
};

export type ResearchCoverage = {
  calibrationCoveragePct: number | null;
  mispricingAtlasCoveragePct: number | null;
  mispricingAtlasPresent: boolean;
  leadLagCoveragePct: number | null;
  leadLagPresent: boolean;
  significanceCoveragePct: number | null;
  significancePresent: boolean;
  powerAnalysisPresent: boolean;
  overfittingDiagnosticsPresent: boolean;
  regimeTagsPresent: boolean;
  hypothesesPresent: boolean;
};

export type ArtifactFreshnessEntry = {
  path: string;
  lastModified: string | null;
};

export type StaleDependencyWarning = {
  code: string;
  message: string;
  upstreamPath: string;
  downstreamPath: string;
  upstreamLastModified: string | null;
  downstreamLastModified: string | null;
};

export type ArtifactFreshness = {
  artifacts: readonly ArtifactFreshnessEntry[];
  staleDependencyWarnings: readonly StaleDependencyWarning[];
};

export type DataHealthRecommendation = {
  priority: number;
  action: string;
  reason: string;
};

export type DataHealthReport = {
  generatedAt: string;
  outputPath: string;
  config: DataHealthConfig;
  pipelineCoverage: PipelineCoverage;
  settlementHealth: SettlementHealth;
  researchCoverage: ResearchCoverage;
  artifactFreshness: ArtifactFreshness;
  stageStatuses: readonly DataHealthStageStatus[];
  recommendations: readonly DataHealthRecommendation[];
};

export type DataHealthConfig = {
  discoveryResultPath: string;
  importsDir: string;
  importConfigsDir: string;
  fixturesDir: string;
  registryDir: string;
  researchResultsDir: string;
  leaderboardPath: string;
  reportHtmlPath: string;
  outputPath: string;
};

export type DataHealthIo = {
  readdir: (path: string) => readonly string[];
  readFile: (path: string) => string;
  fileExists: (path: string) => boolean;
  isDirectory: (path: string) => boolean;
  getLastModified: (path: string) => string | null;
};

export type ScannedDataHealthInputs = {
  pipelineCoverage: PipelineCoverage;
  settlementHealth: SettlementHealth;
  researchCoverage: ResearchCoverage;
  artifactFreshness: ArtifactFreshness;
};

export type BuildDataHealthReportInput = {
  generatedAt: string;
  config: DataHealthConfig;
  scanned: ScannedDataHealthInputs;
};
