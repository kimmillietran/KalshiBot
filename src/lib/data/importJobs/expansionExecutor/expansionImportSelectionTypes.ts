export const EXPANSION_IMPORT_SAMPLE_STRATEGIES = [
  "supported-first",
  "earliest",
  "latest",
  "evenly-spaced",
  "random",
] as const;

export type ExpansionImportSampleStrategy =
  (typeof EXPANSION_IMPORT_SAMPLE_STRATEGIES)[number];

export const DEFAULT_EXPANSION_IMPORT_SAMPLE_STRATEGY: ExpansionImportSampleStrategy =
  "supported-first";

export type ExpansionImportPlanningCategory =
  | "likely-supported"
  | "unknown"
  | "known-unsupported";

export const EXPANSION_IMPORT_PLANNING_CATEGORY_ORDER: readonly ExpansionImportPlanningCategory[] =
  ["likely-supported", "unknown", "known-unsupported"];

export type ExpansionImportSelectionCounts = {
  selectedSupportedMarkets: number;
  selectedUnknownMarkets: number;
  selectedUnsupportedMarkets: number;
};

export type ExpansionImportPlanningHistory = {
  summaryPath: string | null;
  summaryPresent: boolean;
  knownUnsupportedTickers: ReadonlySet<string>;
  successfullyImportedTickers: ReadonlySet<string>;
};
