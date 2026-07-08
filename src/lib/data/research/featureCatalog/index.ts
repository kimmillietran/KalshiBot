export {
  adaptCanonicalFeatureCatalog,
} from "./adaptCanonicalFeatureCatalog";

export {
  FEATURE_DUPLICATION_GROUPS,
  GENUINELY_MISSING_INDICATOR_IDS,
} from "../features/catalogExtensions";

export type {
  FeatureCatalogSourceLayer,
  FeatureDuplicationGroup,
  UnifiedFeatureCatalogEntry,
  UnifiedFeatureCatalogDocument,
  GenuinelyMissingIndicatorId,
} from "./featureCatalogTypes";

export {
  DEFAULT_FEATURE_DUPLICATION_ANALYSIS_OUTPUT_PATH,
  DEFAULT_UNIFIED_FEATURE_CATALOG_OUTPUT_PATH,
  FEATURE_CATALOG_SOURCE_LAYERS,
  FEATURE_DUPLICATION_ANALYSIS_FILENAME,
  UNIFIED_FEATURE_CATALOG_FILENAME,
} from "./featureCatalogTypes";

import { adaptCanonicalFeatureCatalog } from "./adaptCanonicalFeatureCatalog";
import { FEATURE_DUPLICATION_GROUPS } from "../features/catalogExtensions";
import type { UnifiedFeatureCatalogDocument } from "./featureCatalogTypes";

/** Explorer-facing catalog rows derived from the canonical features module. */
export function listUnifiedFeatureCatalogEntries() {
  return adaptCanonicalFeatureCatalog();
}

export function getUnifiedFeatureCatalogEntry(featureId: string) {
  return listUnifiedFeatureCatalogEntries().find((entry) => entry.featureId === featureId) ?? null;
}

export function buildUnifiedFeatureCatalogDocument(generatedAt: string): UnifiedFeatureCatalogDocument {
  return {
    schemaVersion: 1,
    generatedAt,
    entries: listUnifiedFeatureCatalogEntries(),
    duplicationGroups: FEATURE_DUPLICATION_GROUPS,
  };
}
