import type {
  HistoricalBronzeImportBtcConfig,
  HistoricalBronzeImportKalshiConfig,
  HistoricalBronzeImportOutputConfig,
} from "@/lib/data/importJobs/config";

export const DEFAULT_HISTORICAL_COVERAGE_PLAN_PATH =
  "data/research-results/historical-coverage-plan.json";
export const DEFAULT_HISTORICAL_EXPANSION_CONFIG_PATH =
  "data/import-configs/historical-expansion-config.json";
export const DEFAULT_HISTORICAL_EXPANSION_CONFIG_HTML_PATH =
  "data/reports/historical-expansion-config.html";

export const ExpansionConfigErrorCode = {
  MISSING_COVERAGE_PLAN: "missing-coverage-plan",
  INVALID_COVERAGE_PLAN: "invalid-coverage-plan",
  INVALID_COVERAGE_PLAN_JSON: "invalid-coverage-plan-json",
} as const;

export type ExpansionConfigErrorCode =
  (typeof ExpansionConfigErrorCode)[keyof typeof ExpansionConfigErrorCode];

export class ExpansionConfigError extends Error {
  readonly code: ExpansionConfigErrorCode;

  constructor(message: string, code: ExpansionConfigErrorCode) {
    super(message);
    this.name = "ExpansionConfigError";
    this.code = code;
  }
}

export type HistoricalCoverageWindow = {
  windowStart: string;
  windowEnd: string;
};

export type HistoricalCoveragePlanRecommendation = HistoricalCoverageWindow & {
  priority: number;
  seriesTicker?: string;
  estimatedMarketCount?: number | null;
  expectedResearchBenefit?: string | null;
  reason?: string | null;
};

export type HistoricalCoveragePlanSnapshot = {
  currentMarketCount?: number | null;
  uniqueTradingDays?: number | null;
  monthCoverage?: readonly string[];
  missingMonths?: readonly string[];
  coveredWindows?: readonly HistoricalCoverageWindow[];
};

export type HistoricalCoveragePlan = {
  generatedAt: string;
  outputPath: string;
  coverageSnapshot?: HistoricalCoveragePlanSnapshot;
  recommendations: readonly HistoricalCoveragePlanRecommendation[];
};

export type HistoricalExpansionDiscoverySampling = {
  afterDate: string;
  beforeDate: string;
};

export type HistoricalExpansionImportDefaults = {
  kalshi: HistoricalBronzeImportKalshiConfig;
  btc: HistoricalBronzeImportBtcConfig;
  output: HistoricalBronzeImportOutputConfig;
};

export type HistoricalExpansionImportJobStatus = "scheduled" | "skipped";

export type HistoricalExpansionImportJob = {
  jobId: string;
  priority: number;
  status: HistoricalExpansionImportJobStatus;
  seriesTicker: string;
  windowStart: string;
  windowEnd: string;
  estimatedMarketCount: number | null;
  reason: string | null;
  expectedResearchBenefit: string | null;
  skipReason: string | null;
  discovery: {
    seriesTicker: string;
    sampling: HistoricalExpansionDiscoverySampling;
  };
  importDefaults: HistoricalExpansionImportDefaults;
};

export type HistoricalExpansionImportConfigSummary = {
  recommendationCount: number;
  scheduledJobCount: number;
  skippedJobCount: number;
};

export type HistoricalExpansionImportConfig = {
  generatedAt: string;
  outputPath: string;
  inputPath: string;
  dryRun: boolean;
  importConfigsDir: string;
  summary: HistoricalExpansionImportConfigSummary;
  jobs: readonly HistoricalExpansionImportJob[];
};

export type BuildHistoricalExpansionImportConfigInput = {
  plan: HistoricalCoveragePlan;
  inputPath: string;
  outputPath: string;
  importConfigsDir: string;
  generatedAt: string;
  dryRun: boolean;
  existingCoveredWindows?: readonly HistoricalCoverageWindow[];
};
