import { RESEARCH_DIMENSIONS } from "@/lib/data/research/dimensions";
import type { ResearchDimensionId } from "@/lib/data/research/dimensions/types";

import {
  UNIFIED_FEATURE_CATALOG,
  UNIFIED_FEATURE_CATALOG_VERSION,
} from "./catalog";
import type { FeatureSourceLayer, UnifiedFeatureCatalogEntry } from "./types";

export class UnifiedFeatureCatalogError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnifiedFeatureCatalogError";
  }
}

const FEATURE_BY_ID = new Map<string, UnifiedFeatureCatalogEntry>(
  UNIFIED_FEATURE_CATALOG.map((entry) => [entry.id, entry]),
);

/** Returns the full catalog in deterministic id order. */
export function listUnifiedFeatures(): readonly UnifiedFeatureCatalogEntry[] {
  return UNIFIED_FEATURE_CATALOG;
}

/** Resolves canonical metadata for a catalog feature id. */
export function getUnifiedFeatureById(featureId: string): UnifiedFeatureCatalogEntry | null {
  return FEATURE_BY_ID.get(featureId) ?? null;
}

/** Requires a catalog entry or throws with a stable error. */
export function requireUnifiedFeatureById(featureId: string): UnifiedFeatureCatalogEntry {
  const entry = getUnifiedFeatureById(featureId);
  if (!entry) {
    throw new UnifiedFeatureCatalogError(`Unknown feature id: ${featureId}`);
  }

  return entry;
}

export function listUnifiedFeaturesBySourceLayer(
  sourceLayer: FeatureSourceLayer,
): readonly UnifiedFeatureCatalogEntry[] {
  return UNIFIED_FEATURE_CATALOG.filter((entry) => entry.sourceLayer === sourceLayer);
}

/** Maps each M10 research dimension id to a catalog feature that supplies its signal. */
export function buildResearchDimensionFeatureMap(): ReadonlyMap<
  ResearchDimensionId,
  UnifiedFeatureCatalogEntry
> {
  const map = new Map<ResearchDimensionId, UnifiedFeatureCatalogEntry>();

  for (const dimension of RESEARCH_DIMENSIONS) {
    const match = UNIFIED_FEATURE_CATALOG.find((entry) =>
      entry.linkedResearchDimensionIds?.includes(dimension.id),
    );

    if (match) {
      map.set(dimension.id, match);
    }
  }

  return map;
}

export function getUnifiedFeatureForResearchDimension(
  dimensionId: ResearchDimensionId,
): UnifiedFeatureCatalogEntry | null {
  return buildResearchDimensionFeatureMap().get(dimensionId) ?? null;
}

export type UnifiedFeatureCatalogIntegrityReport = {
  version: string;
  featureCount: number;
  duplicateIds: readonly string[];
  missingRequiredFields: readonly string[];
  unresolvedDependencies: readonly { featureId: string; dependencyId: string }[];
  unmappedResearchDimensions: readonly ResearchDimensionId[];
};

const REQUIRED_STRING_FIELDS = [
  "id",
  "displayName",
  "units",
] as const satisfies readonly (keyof UnifiedFeatureCatalogEntry)[];

/** Validates catalog invariants used by tests and CI. */
export function assertUnifiedFeatureCatalogIntegrity(): UnifiedFeatureCatalogIntegrityReport {
  const duplicateIds: string[] = [];
  const seen = new Set<string>();
  const missingRequiredFields: string[] = [];
  const unresolvedDependencies: { featureId: string; dependencyId: string }[] = [];

  for (const entry of UNIFIED_FEATURE_CATALOG) {
    if (seen.has(entry.id)) {
      duplicateIds.push(entry.id);
    }

    seen.add(entry.id);

    for (const field of REQUIRED_STRING_FIELDS) {
      const value = entry[field];
      if (typeof value !== "string" || value.trim().length === 0) {
        missingRequiredFields.push(`${entry.id}.${field}`);
      }
    }

    if (!entry.canonicalSource?.path) {
      missingRequiredFields.push(`${entry.id}.canonicalSource.path`);
    }

    for (const dependencyId of entry.dependencies) {
      if (!FEATURE_BY_ID.has(dependencyId)) {
        unresolvedDependencies.push({ featureId: entry.id, dependencyId });
      }
    }
  }

  const dimensionMap = buildResearchDimensionFeatureMap();
  const unmappedResearchDimensions = RESEARCH_DIMENSIONS.map((dimension) => dimension.id).filter(
    (dimensionId) => !dimensionMap.has(dimensionId),
  );

  if (
    duplicateIds.length > 0
    || missingRequiredFields.length > 0
    || unresolvedDependencies.length > 0
    || unmappedResearchDimensions.length > 0
  ) {
    throw new UnifiedFeatureCatalogError(
      [
        "Unified feature catalog integrity check failed.",
        duplicateIds.length > 0 ? `Duplicates: ${duplicateIds.join(", ")}` : null,
        missingRequiredFields.length > 0
          ? `Missing fields: ${missingRequiredFields.join(", ")}`
          : null,
        unresolvedDependencies.length > 0
          ? `Unresolved deps: ${unresolvedDependencies
            .map((entry) => `${entry.featureId}->${entry.dependencyId}`)
            .join(", ")}`
          : null,
        unmappedResearchDimensions.length > 0
          ? `Unmapped dimensions: ${unmappedResearchDimensions.join(", ")}`
          : null,
      ]
        .filter(Boolean)
        .join(" "),
    );
  }

  return {
    version: UNIFIED_FEATURE_CATALOG_VERSION,
    featureCount: UNIFIED_FEATURE_CATALOG.length,
    duplicateIds,
    missingRequiredFields,
    unresolvedDependencies,
    unmappedResearchDimensions,
  };
}

export { UNIFIED_FEATURE_CATALOG, UNIFIED_FEATURE_CATALOG_VERSION };
