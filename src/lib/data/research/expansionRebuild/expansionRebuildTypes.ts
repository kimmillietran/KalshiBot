export const DEFAULT_HISTORICAL_EXPANSION_IMPORT_SUMMARY_PATH =
  "data/research-results/historical-expansion-import-summary.json";
export const DEFAULT_EXPANSION_REBUILD_SUMMARY_PATH =
  "data/research-results/expansion-rebuild-summary.json";
export const DEFAULT_EXPANSION_REBUILD_SUMMARY_HTML_PATH =
  "data/reports/expansion-rebuild-summary.html";
export const DEFAULT_EXPANSION_FIXTURES_DIR = "data/fixtures";
export const DEFAULT_EXPANSION_IMPORTS_DIR = "data/imports";
export const DEFAULT_EXPANSION_REGISTRY_DIR = "data/research-datasets";
export const DEFAULT_EXPANSION_RESEARCH_RESULTS_DIR = "data/research-results";
export const DEFAULT_EXPANSION_MISPRICING_ATLAS_PATH =
  "data/research-results/mispricing-atlas.json";
export const DEFAULT_EXPANSION_IMPORT_CONFIGS_DIR = "data/import-configs";

export const ExpansionRebuildErrorCode = {
  MISSING_EXPANSION_IMPORT_SUMMARY: "missing-expansion-import-summary",
  INVALID_EXPANSION_IMPORT_SUMMARY: "invalid-expansion-import-summary",
  INVALID_EXPANSION_IMPORT_SUMMARY_JSON: "invalid-expansion-import-summary-json",
  NO_TARGET_MARKETS: "no-target-markets",
  INVALID_CONCURRENCY: "invalid-concurrency",
} as const;

export type ExpansionRebuildErrorCode =
  (typeof ExpansionRebuildErrorCode)[keyof typeof ExpansionRebuildErrorCode];

export class ExpansionRebuildError extends Error {
  readonly code: ExpansionRebuildErrorCode;

  constructor(message: string, code: ExpansionRebuildErrorCode) {
    super(message);
    this.name = "ExpansionRebuildError";
    this.code = code;
  }
}

export type ExpansionImportMarketStatus =
  | "planned"
  | "imported"
  | "skipped"
  | "failed";

export type HistoricalExpansionImportMarketResult = {
  marketTicker: string;
  seriesTicker: string;
  status: ExpansionImportMarketStatus;
  importResultPath: string | null;
};

export type HistoricalExpansionImportJobResult = {
  jobId: string;
  seriesTicker: string;
  markets: readonly HistoricalExpansionImportMarketResult[];
};

export type HistoricalExpansionImportSummary = {
  generatedAt: string;
  execute: boolean;
  inputPath: string;
  outputPath: string;
  jobs: readonly HistoricalExpansionImportJobResult[];
};

export type ExpansionRebuildTargetMarket = {
  marketTicker: string;
  seriesTicker: string;
  importResultPath: string;
};

export type ExpansionRebuildMetrics = {
  fixtureCount: number;
  researchOutputCount: number;
  registryMarketCount: number;
  uniqueTradingDays: number | null;
  atlasMarketCount: number | null;
};

export type ExpansionRebuildMarketStatus = "success" | "failed" | "skipped";

export type ExpansionRebuildFixtureMarketResult = {
  marketTicker: string;
  seriesTicker: string;
  importResultPath: string;
  fixturePath: string;
  status: ExpansionRebuildMarketStatus;
  errorMessage: string | null;
};

export type ExpansionRebuildResearchMarketResult = {
  marketTicker: string;
  seriesTicker: string;
  fixturePath: string;
  outputPath: string;
  status: ExpansionRebuildMarketStatus;
  errorMessage: string | null;
  runId: string | null;
};

export type ExpansionRebuildSummary = {
  generatedAt: string;
  outputPath: string;
  htmlOutputPath: string;
  inputPath: string;
  fullRebuild: boolean;
  targetMarketCount: number;
  before: ExpansionRebuildMetrics;
  after: ExpansionRebuildMetrics;
  fixtureResults: readonly ExpansionRebuildFixtureMarketResult[];
  researchResults: readonly ExpansionRebuildResearchMarketResult[];
  summary: {
    fixturesBuilt: number;
    fixturesSkipped: number;
    fixturesFailed: number;
    researchRunsSucceeded: number;
    researchRunsSkipped: number;
    researchRunsFailed: number;
    registrySeriesCount: number;
    durationMs: number;
  };
  warnings: readonly string[];
};

export type ExpansionRebuildIo = {
  readdir: (path: string) => readonly string[];
  readFile: (path: string) => string;
  fileExists: (path: string) => boolean;
  isDirectory: (path: string) => boolean;
  writeFile: (path: string, data: string) => void;
  mkdirSync: (path: string, options: { recursive: boolean }) => void;
};

export type RunExpansionRebuildInput = {
  expansionImportSummaryPath: string;
  fixturesDir: string;
  importsDir: string;
  importConfigsDir: string;
  metadataDir: string | null;
  registryDir: string;
  researchResultsDir: string;
  mispricingAtlasPath: string;
  outputPath: string;
  htmlOutputPath: string;
  fullRebuild: boolean;
  concurrency: number;
  generatedAt: string;
};

export type RunExpansionRebuildDeps = {
  runFixtureBridge: (input: {
    importPath: string;
    importResult: import("@/lib/data/importJobs/historicalBronzeImportJobTypes").HistoricalBronzeImportJobCoreResult;
    marketTicker: string;
  }) => string;
  parseImportResultJson: (json: string) => import("@/lib/data/importJobs/historicalBronzeImportJobTypes").HistoricalBronzeImportJobCoreResult;
  parseFixtureJson: (
    json: string,
    marketTicker?: string,
  ) => import("@/lib/data/fixtures/historicalFixtureTypes").HistoricalResearchCliInput;
  runResearch: (input: {
    fixture: import("@/lib/data/fixtures/historicalFixtureTypes").HistoricalResearchCliInput;
    marketTicker: string;
    seriesTicker: string;
  }) => string;
};
