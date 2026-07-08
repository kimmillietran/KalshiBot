import {
  FEATURE_DUPLICATION_GROUPS,
  GENUINELY_MISSING_INDICATOR_IDS,
  listUnifiedFeatureCatalogEntries,
} from "@/lib/data/research/featureCatalog";
import type { UnifiedFeatureCatalogEntry } from "@/lib/data/research/featureCatalog";
import {
  listResearchAxisGroups,
  RESEARCH_DIMENSIONS,
} from "@/lib/data/research/dimensions";

import type { LoadedFeatureCatalogExplorerInputs } from "./loadFeatureCatalogExplorerInputs";
import type {
  FeatureCatalogExplorerFeatureEntry,
  FeatureCatalogExplorerReport,
} from "./featureCatalogExplorerTypes";

function familyMatchesFeature(researchFamily: string, featureId: string): boolean {
  const normalizedFamily = researchFamily.toLowerCase();
  const normalizedFeature = featureId.toLowerCase().replace(/-/g, "");
  return (
    normalizedFamily.includes(normalizedFeature)
    || normalizedFeature.includes(normalizedFamily.replace(/[-_]/g, ""))
    || (normalizedFamily.includes("momentum") && featureId.includes("momentum"))
    || (normalizedFamily.includes("hour") && featureId.includes("hour"))
    || (normalizedFamily.includes("volatility") && featureId.includes("volatility"))
  );
}

function buildDimensionMetrics(loadedInputs: LoadedFeatureCatalogExplorerInputs) {
  const axisGroupsByDimension = new Map<string, string[]>();
  const candidateYieldByDimension = new Map<string, number>();
  const bucketCountByDimension = new Map<string, number>();
  const coverageNotesByDimension = new Map<string, string>();

  for (const group of listResearchAxisGroups()) {
    for (const dimensionId of group.dimensionIds) {
      const groups = axisGroupsByDimension.get(dimensionId) ?? [];
      groups.push(group.groupId);
      axisGroupsByDimension.set(dimensionId, groups);

      const explorerGroup = loadedInputs.dimensionExplorer?.axisGroups?.find(
        (entry) => entry.groupId === group.groupId,
      );
      if (explorerGroup) {
        candidateYieldByDimension.set(
          dimensionId,
          (candidateYieldByDimension.get(dimensionId) ?? 0)
            + (explorerGroup.candidateYield ?? 0),
        );
      }
    }
  }

  for (const dimension of loadedInputs.dimensionExplorer?.dimensions ?? []) {
    bucketCountByDimension.set(dimension.dimensionId, dimension.bucketCount ?? 0);
    if (dimension.coverage !== null && dimension.coverage !== undefined) {
      coverageNotesByDimension.set(
        dimension.dimensionId,
        `Coverage ${Math.round(dimension.coverage * 100)}% · sparsity ${Math.round((dimension.sparsity ?? 0) * 100)}% · ${dimension.observationCount ?? 0} observations`,
      );
    }
  }

  for (const dimension of RESEARCH_DIMENSIONS) {
    if (!bucketCountByDimension.has(dimension.id)) {
      bucketCountByDimension.set(dimension.id, dimension.getBuckets().length);
    }
  }

  return {
    axisGroupsByDimension,
    candidateYieldByDimension,
    bucketCountByDimension,
    coverageNotesByDimension,
  };
}

function resolveRobustness(
  featureId: string,
  dimensionId: string | null,
  loadedInputs: LoadedFeatureCatalogExplorerInputs,
): number | null {
  for (const entry of loadedInputs.portfolioAnalytics?.entries ?? []) {
    if (
      (familyMatchesFeature(entry.researchFamily, featureId)
        || (dimensionId !== null
          && familyMatchesFeature(entry.researchFamily, dimensionId)))
      && entry.robustnessMedian !== undefined
    ) {
      return entry.robustnessMedian;
    }
  }

  if (dimensionId) {
    for (const entry of loadedInputs.roiAnalysis?.entries ?? []) {
      if (
        familyMatchesFeature(entry.researchFamily, dimensionId)
        && entry.roiScore !== undefined
      ) {
        return entry.roiScore;
      }
    }
  }

  return null;
}

function resolveDuplicationStatus(
  featureId: string,
  catalogDuplicationGroupId: string | null,
  loadedInputs: LoadedFeatureCatalogExplorerInputs,
): string | null {
  const external = loadedInputs.duplicationAnalysis?.entries?.find(
    (entry) => entry.featureId === featureId,
  );
  if (external?.status) {
    return external.summary ?? external.status;
  }

  if (!catalogDuplicationGroupId) {
    return null;
  }

  const group = FEATURE_DUPLICATION_GROUPS.find(
    (entry) => entry.groupId === catalogDuplicationGroupId,
  );
  return group ? `duplicate:${group.groupId}` : null;
}

function isUsedInResearch(input: {
  implemented: boolean;
  onMispricingObservation: boolean;
  registeredAsResearchDimension: boolean;
  participatesInAxisGroups: boolean;
}): boolean {
  if (!input.implemented) {
    return false;
  }

  if (input.registeredAsResearchDimension) {
    return true;
  }

  return input.onMispricingObservation && input.participatesInAxisGroups;
}

function catalogMetadataForDimension(
  dimensionId: string,
  catalogEntries: readonly UnifiedFeatureCatalogEntry[],
): boolean {
  return catalogEntries.some((entry) => entry.researchDimensionId === dimensionId);
}

/** Builds per-feature catalog explorer rows joined with registry and optional diagnostics. */
export function analyzeFeatureCatalog(
  loadedInputs: LoadedFeatureCatalogExplorerInputs,
  catalogEntries: readonly UnifiedFeatureCatalogEntry[] = listUnifiedFeatureCatalogEntries(),
): Pick<
  FeatureCatalogExplorerReport,
  | "features"
  | "computedButUnused"
  | "dimensionsWithoutCatalogMetadata"
  | "eligibleForFutureDimensions"
  | "genuinelyMissingIndicators"
  | "recommendedNextFeatureDimensions"
  | "summary"
> {
  const metrics = buildDimensionMetrics(loadedInputs);

  const features: FeatureCatalogExplorerFeatureEntry[] = catalogEntries.map(
    (entry) => {
      const dimensionId = entry.researchDimensionId;
      const axisGroups = dimensionId
        ? [...(metrics.axisGroupsByDimension.get(dimensionId) ?? [])].sort()
        : [];
      const registeredAsResearchDimension = dimensionId !== null;
      const onMispricingObservation = entry.mispricingObservationField !== null;
      const participatesInAxisGroups = axisGroups.length > 0;
      const usedInResearch = isUsedInResearch({
        implemented: entry.implemented,
        onMispricingObservation,
        registeredAsResearchDimension,
        participatesInAxisGroups,
      });

      return {
        featureId: entry.featureId,
        label: entry.label,
        sourceLayer: entry.sourceLayer,
        canonicalSource: entry.canonicalSource,
        implemented: entry.implemented,
        onMispricingObservation,
        registeredAsResearchDimension,
        researchDimensionId: dimensionId,
        participatesInAxisGroups: axisGroups,
        bucketCount: dimensionId
          ? metrics.bucketCountByDimension.get(dimensionId) ?? null
          : null,
        candidateYield: dimensionId
          ? metrics.candidateYieldByDimension.get(dimensionId) ?? null
          : null,
        averageRobustness: resolveRobustness(
          entry.featureId,
          dimensionId,
          loadedInputs,
        ),
        coverageNotes: dimensionId
          ? metrics.coverageNotesByDimension.get(dimensionId) ?? entry.notes
          : entry.notes,
        duplicationStatus: resolveDuplicationStatus(
          entry.featureId,
          entry.duplicationGroupId,
          loadedInputs,
        ),
        usedInResearch,
      };
    },
  );

  const computedButUnused = features
    .filter(
      (entry) =>
        entry.implemented
        && !entry.usedInResearch
        && entry.sourceLayer !== "missing-indicator",
    )
    .map((entry) => entry.featureId)
    .sort((left, right) => left.localeCompare(right));

  const dimensionsWithoutCatalogMetadata = RESEARCH_DIMENSIONS.map(
    (dimension) => dimension.id,
  )
    .filter((dimensionId) => !catalogMetadataForDimension(dimensionId, catalogEntries))
    .sort((left, right) => left.localeCompare(right));

  const eligibleForFutureDimensions = features
    .filter(
      (entry) =>
        entry.implemented
        && !entry.registeredAsResearchDimension
        && (entry.onMispricingObservation || entry.sourceLayer === "market-features"),
    )
    .map((entry) => entry.featureId)
    .sort((left, right) => left.localeCompare(right));

  const genuinelyMissingIndicators = GENUINELY_MISSING_INDICATOR_IDS.filter(
    (featureId) =>
      !catalogEntries.find((entry) => entry.featureId === featureId)?.implemented,
  );

  const recommendedNextFeatureDimensions = eligibleForFutureDimensions
    .slice(0, 8)
    .map((featureId) => {
      const feature = features.find((entry) => entry.featureId === featureId)!;
      return {
        featureId,
        label: feature.label,
        rationale:
          feature.onMispricingObservation
            ? `${feature.label} is available on MispricingObservation but not registered as a research dimension.`
            : `${feature.label} is computed in market features but not wired into research dimensions.`,
      };
    });

  const optionalStatus = Object.values(loadedInputs.inputStatus);

  return {
    features: sortFeatureCatalogEntries(features),
    computedButUnused,
    dimensionsWithoutCatalogMetadata,
    eligibleForFutureDimensions,
    genuinelyMissingIndicators,
    recommendedNextFeatureDimensions,
    summary: {
      totalFeatures: features.length,
      implementedFeatures: features.filter((entry) => entry.implemented).length,
      missingIndicators: genuinelyMissingIndicators.length,
      usedInResearchCount: features.filter((entry) => entry.usedInResearch).length,
      computedButUnusedCount: computedButUnused.length,
      dimensionsWithoutCatalogCount: dimensionsWithoutCatalogMetadata.length,
      eligibleForFutureDimensionCount: eligibleForFutureDimensions.length,
      registryDimensionCount: RESEARCH_DIMENSIONS.length,
      optionalArtifactsAvailable: optionalStatus.filter(Boolean).length,
      optionalArtifactsTotal: optionalStatus.length,
    },
  };
}

export function compareFeatureCatalogEntries(
  left: FeatureCatalogExplorerFeatureEntry,
  right: FeatureCatalogExplorerFeatureEntry,
): number {
  const layerCompare = left.sourceLayer.localeCompare(right.sourceLayer);
  if (layerCompare !== 0) {
    return layerCompare;
  }

  return left.featureId.localeCompare(right.featureId);
}

export function sortFeatureCatalogEntries(
  features: readonly FeatureCatalogExplorerFeatureEntry[],
): FeatureCatalogExplorerFeatureEntry[] {
  return [...features].sort(compareFeatureCatalogEntries);
}
