export {
  assertUnifiedFeatureCatalogIntegrity,
  buildResearchDimensionFeatureMap,
  getUnifiedFeatureById,
  getUnifiedFeatureForResearchDimension,
  listUnifiedFeatures,
  listUnifiedFeaturesBySourceLayer,
  requireUnifiedFeatureById,
  UNIFIED_FEATURE_CATALOG,
  UNIFIED_FEATURE_CATALOG_VERSION,
  UnifiedFeatureCatalogError,
} from "./registry";

export type { UnifiedFeatureCatalogIntegrityReport } from "./registry";

export { UNIFIED_FEATURE_CATALOG as FEATURE_CATALOG_ENTRIES } from "./catalog";

export {
  FEATURE_OUTPUT_TYPES,
  FEATURE_SOURCE_LAYERS,
} from "./types";

export type {
  FeatureCanonicalSource,
  FeatureLookbackMetadata,
  FeatureOutputType,
  FeatureSourceLayer,
  UnifiedFeatureCatalog,
  UnifiedFeatureCatalogEntry,
} from "./types";
