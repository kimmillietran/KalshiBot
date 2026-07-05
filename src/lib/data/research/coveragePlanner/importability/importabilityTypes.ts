export type EstimatedSupportLevel = "high" | "medium" | "low";

export type ExpansionImportMarketOutcomeCategory =
  | "successful-import"
  | "compatibility-failure"
  | "unsupported-market"
  | "other-failure"
  | "skipped-deduped"
  | "skipped-other"
  | "planned";

export type ParsedExpansionImportMarketRecord = {
  marketTicker: string;
  seriesTicker: string;
  status: "planned" | "imported" | "skipped" | "failed";
  errorMessage: string | null;
  skipReason: string | null;
  calendarMonth: string | null;
  outcomeCategory: ExpansionImportMarketOutcomeCategory;
};

export type ExpansionImportSummaryDocument = {
  generatedAt: string;
  inputPath: string;
  outputPath: string;
  execute: boolean;
  jobs: readonly {
    jobId: string;
    seriesTicker: string;
    markets: readonly ParsedExpansionImportMarketRecord[];
  }[];
};

export type WindowImportabilityStats = {
  windowKey: string;
  seriesTicker: string;
  startMonth: string;
  endMonth: string;
  attemptedCount: number;
  successfulImports: number;
  compatibilityFailures: number;
  unsupportedMarkets: number;
  historicalSuccessRate: number | null;
  estimatedUnsupportedRate: number;
  estimatedSupportLevel: EstimatedSupportLevel;
};

export type HistoricalImportabilityProfile = {
  summaryPath: string | null;
  summaryPresent: boolean;
  summariesLoaded: number;
  totalAttempts: number;
  successfulImports: number;
  compatibilityFailures: number;
  unsupportedMarkets: number;
  historicalSuccessRate: number | null;
  windows: readonly WindowImportabilityStats[];
};

export type RecommendationImportabilityEstimate = {
  estimatedSupportLevel: EstimatedSupportLevel;
  estimatedUnsupportedRate: number;
  attemptedCount: number;
  successfulImports: number;
  compatibilityFailures: number;
  unsupportedMarkets: number;
};
