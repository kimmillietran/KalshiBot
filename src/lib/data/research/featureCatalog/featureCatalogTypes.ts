import type { ResearchDimensionId } from "@/lib/data/research/dimensions/types";
import type { MispricingObservation } from "@/lib/data/research/mispricingAtlas/mispricingAtlasTypes";

export const UNIFIED_FEATURE_CATALOG_FILENAME = "unified-feature-catalog.json";
export const DEFAULT_UNIFIED_FEATURE_CATALOG_OUTPUT_PATH =
  "data/research-results/unified-feature-catalog.json";

export const FEATURE_DUPLICATION_ANALYSIS_FILENAME = "feature-duplication-analysis.json";
export const DEFAULT_FEATURE_DUPLICATION_ANALYSIS_OUTPUT_PATH =
  "data/research-results/feature-duplication-analysis.json";

export const FEATURE_CATALOG_SOURCE_LAYERS = [
  "mispricing-observation",
  "market-features",
  "trading-features",
  "research-dimension-derived",
  "missing-indicator",
] as const;

export type FeatureCatalogSourceLayer = (typeof FEATURE_CATALOG_SOURCE_LAYERS)[number];

export type UnifiedFeatureCatalogEntry = {
  featureId: string;
  label: string;
  sourceLayer: FeatureCatalogSourceLayer;
  canonicalSource: string;
  mispricingObservationField: keyof MispricingObservation | null;
  researchDimensionId: ResearchDimensionId | null;
  implemented: boolean;
  duplicationGroupId: string | null;
  notes: string | null;
};

export type FeatureDuplicationGroup = {
  groupId: string;
  label: string;
  featureIds: readonly string[];
  summary: string;
};

export type UnifiedFeatureCatalogDocument = {
  schemaVersion: 1;
  generatedAt: string;
  entries: readonly UnifiedFeatureCatalogEntry[];
  duplicationGroups: readonly FeatureDuplicationGroup[];
};

export const GENUINELY_MISSING_INDICATOR_IDS = [
  "ema",
  "vwap",
  "atr",
  "rsi",
  "macd",
  "bollinger-bands",
] as const;

export type GenuinelyMissingIndicatorId = (typeof GENUINELY_MISSING_INDICATOR_IDS)[number];
