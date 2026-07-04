import type { DataHealthReport } from "@/lib/data/research/dataHealth/dataHealthTypes";
import type { HypothesisValidationReport } from "@/lib/data/research/hypothesisRobustness/hypothesisRobustnessTypes";
import type { MispricingAtlas } from "@/lib/data/research/mispricingAtlas/mispricingAtlasTypes";
import type { RegimeTagsReport } from "@/lib/data/research/regimeTagging/regimeTaggingTypes";

export const HISTORICAL_COVERAGE_PLAN_FILENAME = "historical-coverage-plan.json";
export const DEFAULT_HISTORICAL_COVERAGE_PLAN_OUTPUT_PATH =
  "data/research-results/historical-coverage-plan.json";
export const DEFAULT_HISTORICAL_COVERAGE_PLAN_HTML_PATH =
  "data/reports/historical-coverage-plan.html";

export const DEFAULT_DATA_HEALTH_INPUT_PATH = "data/research-results/data-health.json";
export const DEFAULT_MISPRICING_ATLAS_INPUT_PATH =
  "data/research-results/mispricing-atlas.json";
export const DEFAULT_HYPOTHESIS_VALIDATION_INPUT_PATH =
  "data/research-results/hypothesis-validation.json";
export const DEFAULT_REGIME_TAGS_INPUT_PATH = "data/research-results/regime-tags.json";
export const DEFAULT_IMPORT_CONFIGS_DIR = "data/import-configs";
export const DEFAULT_FIXTURES_DIR = "data/fixtures";
export const DEFAULT_RESEARCH_RESULTS_DIR = "data/research-results";

export const DEFAULT_MONTH_PERSISTENCE_THRESHOLD = 0.67;
export const DEFAULT_MIN_MARKETS_PER_MONTH = 100;
export const DEFAULT_MIN_TRADING_DAYS_PER_MONTH = 10;

export type CoverageDepthStatus = "MISSING" | "UNDER_COVERED" | "COVERED";

export type MonthCoverageThresholdComparison = {
  minMarketsPerMonth: number;
  minTradingDaysPerMonth: number;
  marketsMet: boolean;
  tradingDaysMet: boolean;
};

export const CoveragePlannerErrorCode = {
  INVALID_JSON: "invalid-json",
  INVALID_DOCUMENT: "invalid-document",
} as const;

export type CoveragePlannerErrorCode =
  (typeof CoveragePlannerErrorCode)[keyof typeof CoveragePlannerErrorCode];

export class CoveragePlannerError extends Error {
  readonly code: CoveragePlannerErrorCode;

  constructor(message: string, code: CoveragePlannerErrorCode) {
    super(message);
    this.name = "CoveragePlannerError";
    this.code = code;
  }
}

export type CoverageMarketSource =
  | "import-config"
  | "fixture"
  | "research-output";

export type CoverageMarketRecord = {
  seriesTicker: string;
  marketTicker: string;
  source: CoverageMarketSource;
  calendarMonths: readonly string[];
  tradingDays: readonly string[];
  volatilityRegime: "low" | "medium" | "high" | null;
};

export type MonthCoverageEntry = {
  month: string;
  marketCount: number;
  tradingDayCount: number;
  coverageStatus: CoverageDepthStatus;
  thresholds: MonthCoverageThresholdComparison;
};

export type VolatilityRegimeCoverageEntry = {
  regime: "low" | "medium" | "high" | "untagged";
  marketCount: number;
};

export type MarketTypeCoverageEntry = {
  seriesTicker: string;
  marketCount: number;
  monthCount: number;
  tickerPattern: string;
};

export type CoverageSnapshot = {
  marketCount: number;
  uniqueTradingDays: number;
  monthCoverage: readonly MonthCoverageEntry[];
  missingMonths: readonly string[];
  underCoveredMonths: readonly string[];
  coveredMonths: readonly string[];
  depthThresholds: CoverageDepthThresholds;
  coverageHorizon: {
    earliestMonth: string | null;
    latestMonth: string | null;
  };
  volatilityRegimeCoverage: readonly VolatilityRegimeCoverageEntry[];
  marketTypeCoverage: readonly MarketTypeCoverageEntry[];
  importConfigCount: number;
  fixtureCount: number;
  researchOutputCount: number;
};

export type CoverageDepthThresholds = {
  minMarketsPerMonth: number;
  minTradingDaysPerMonth: number;
};

export type CoverageImportRecommendation = {
  recommendationId: string;
  seriesTicker: string;
  startMonth: string;
  endMonth: string;
  /** Months addressed by this recommendation (missing and/or under-covered). */
  missingMonths: readonly string[];
  includesMissing: boolean;
  includesUnderCovered: boolean;
  priorityScore: number;
  rationale: string;
  expectedResearchBenefit: string;
  supportingHypothesisIds: readonly string[];
};

export type CoveragePlannerInputStatus = {
  dataHealthPath: string;
  mispricingAtlasPath: string;
  hypothesisValidationPath: string;
  regimeTagsPath: string;
  importConfigsDir: string;
  fixturesDir: string;
  researchResultsDir: string;
  dataHealthPresent: boolean;
  mispricingAtlasPresent: boolean;
  hypothesisValidationPresent: boolean;
  regimeTagsPresent: boolean;
};

export type HistoricalCoveragePlanConfig = {
  outputPath: string;
  htmlOutputPath: string;
  dataHealthPath: string;
  mispricingAtlasPath: string;
  hypothesisValidationPath: string;
  regimeTagsPath: string;
  importConfigsDir: string;
  fixturesDir: string;
  researchResultsDir: string;
  monthPersistenceThreshold: number;
  minMarketsPerMonth: number;
  minTradingDaysPerMonth: number;
};

export type HistoricalCoveragePlanReport = {
  generatedAt: string;
  outputPath: string;
  htmlOutputPath: string;
  config: HistoricalCoveragePlanConfig;
  inputStatus: CoveragePlannerInputStatus;
  snapshot: CoverageSnapshot;
  recommendations: readonly CoverageImportRecommendation[];
  plannerNotes: readonly string[];
};

export type ParsedCoveragePlannerArtifacts = {
  dataHealth: DataHealthReport | null;
  mispricingAtlas: MispricingAtlas | null;
  hypothesisValidation: HypothesisValidationReport | null;
  regimeTags: RegimeTagsReport | null;
};

export type CoveragePlannerIo = {
  readdir: (path: string) => readonly string[];
  readFile: (path: string) => string;
  fileExists: (path: string) => boolean;
  isDirectory: (path: string) => boolean;
};

export type BuildHistoricalCoveragePlanInput = {
  generatedAt: string;
  config: HistoricalCoveragePlanConfig;
  inputStatus: CoveragePlannerInputStatus;
  artifacts: ParsedCoveragePlannerArtifacts;
  marketRecords: readonly CoverageMarketRecord[];
  scanCounts: {
    importConfigCount: number;
    fixtureCount: number;
    researchOutputCount: number;
  };
};
