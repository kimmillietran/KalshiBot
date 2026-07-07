import {
  COARSE_VOLATILITY_REGIME_DEFINITIONS,
  buildCompositeBucketTemplates,
  getResearchDimension,
  listResearchAxisGroups,
  RESEARCH_DIMENSIONS,
  type ResearchDimensionId,
} from "@/lib/data/research/dimensions";
import {
  parseMultiAxisBucketId,
  type ParsedMultiAxisBucketParts,
} from "@/lib/data/research/dimensions/matchers";
import type { ResearchMatcherAxisId } from "@/lib/data/research/dimensions/types";
import { parseAtlasHypothesisCandidateId } from "@/lib/data/research/hypothesisRobustness/parseAtlasHypothesisCandidateId";
import { normalizeMispricingAtlas } from "@/lib/data/research/hypothesisCandidates/normalizeMispricingAtlas";
import type { MispricingAtlas } from "@/lib/data/research/mispricingAtlas/mispricingAtlasTypes";
import { DEFAULT_HYPOTHESIS_MIN_SAMPLE_SIZE } from "@/lib/data/research/hypothesisCandidates/hypothesisCandidateTypes";

import { computeSampleSizeStats, computeShannonEntropy } from "./dimensionExplorerMath";
import type { AtlasBucketSummary, LoadedResearchDimensionExplorerInputs } from "./loadResearchDimensionExplorerInputs";
import type {
  ResearchDimensionExplorerAxisGroupEntry,
  ResearchDimensionExplorerDimensionEntry,
  ResearchDimensionExplorerRecommendation,
  ResearchDimensionExplorerVisualization,
} from "./researchDimensionExplorerTypes";

function resolveMatcherAxisBucketPart(
  parts: ParsedMultiAxisBucketParts,
  axis: ResearchMatcherAxisId,
): string | null {
  switch (axis) {
    case "probability":
      return parts.probabilityBucketId;
    case "time":
      return parts.timeBucketId;
    case "moneyness":
      return parts.moneynessBucketId;
    case "volatility":
      return parts.volatilityBucketId;
    case "momentum":
      return parts.momentumBucketId;
    case "hour":
      return parts.hourBucketId;
    case "dayOfWeek":
      return parts.dayOfWeekBucketId;
    case "session":
      return parts.sessionBucketId;
    case "weekend":
      return parts.weekendBucketId;
    default:
      return null;
  }
}

function resolveAxisGroupCombinationCount(group: ReturnType<typeof listResearchAxisGroups>[number]): number {
  if (group.requiresRegimeVolatility) {
    return (
      getResearchDimension(group.dimensionIds[0]!).getBuckets().length
      * COARSE_VOLATILITY_REGIME_DEFINITIONS.length
    );
  }

  if (group.dimensionIds.length === 1) {
    return getResearchDimension(group.dimensionIds[0]!).getBuckets().length;
  }

  return buildCompositeBucketTemplates(group.dimensionIds).length;
}

function extractDimensionBucketId(
  dimensionId: ResearchDimensionId,
  bucketId: string,
  group: ReturnType<typeof listResearchAxisGroups>[number],
): string | null {
  if (group.dimensionIds.length === 1) {
    return bucketId;
  }

  if (group.groupId === "probabilityRegime") {
    if (dimensionId !== "coarseProbabilityAxis") {
      return null;
    }

    const [probabilityId] = bucketId.split("-coarse-regime-");
    return probabilityId ?? null;
  }

  const parts = parseMultiAxisBucketId(bucketId);

  for (let index = 0; index < group.matcherAxes.length; index += 1) {
    const axis = group.matcherAxes[index];
    const groupDimensionId = group.dimensionIds[index];
    if (!axis || groupDimensionId !== dimensionId) {
      continue;
    }

    const axisBucketId = resolveMatcherAxisBucketPart(parts, axis);
    if (axisBucketId) {
      return axisBucketId;
    }
  }

  return null;
}

function buildAtlasGroupBuckets(
  mispricingAtlas: NonNullable<LoadedResearchDimensionExplorerInputs["mispricingAtlas"]>,
): Map<string, readonly AtlasBucketSummary[]> {
  const bucketsByGroup = new Map<string, readonly AtlasBucketSummary[]>();
  const normalized = normalizeMispricingAtlas(
    mispricingAtlas as unknown as MispricingAtlas,
    DEFAULT_HYPOTHESIS_MIN_SAMPLE_SIZE,
  );

  for (const group of listResearchAxisGroups()) {
    if (group.atlasSource.kind === "singleAxis") {
      bucketsByGroup.set(group.groupId, normalized[group.atlasSource.stateKey] ?? []);
      continue;
    }

    bucketsByGroup.set(
      group.groupId,
      normalized.coarseBuckets[group.atlasSource.coarseBucketsKey] ?? [],
    );
  }

  return bucketsByGroup;
}

function accumulateDimensionBucketObservations(
  dimensionId: ResearchDimensionId,
  bucketsByGroup: Map<string, readonly AtlasBucketSummary[]>,
): Map<string, number> {
  const observationsByBucket = new Map<string, number>();

  for (const group of listResearchAxisGroups()) {
    if (!group.dimensionIds.includes(dimensionId)) {
      continue;
    }

    for (const bucket of bucketsByGroup.get(group.groupId) ?? []) {
      if (bucket.observations <= 0) {
        continue;
      }

      const dimensionBucketId = extractDimensionBucketId(
        dimensionId,
        bucket.bucketId,
        group,
      );
      if (!dimensionBucketId) {
        continue;
      }

      const existing = observationsByBucket.get(dimensionBucketId) ?? 0;
      observationsByBucket.set(
        dimensionBucketId,
        Math.max(existing, bucket.observations),
      );
    }
  }

  return observationsByBucket;
}

export function analyzeRegistryDimensions(
  bucketsByGroup: Map<string, readonly AtlasBucketSummary[]>,
): ResearchDimensionExplorerDimensionEntry[] {
  return RESEARCH_DIMENSIONS.map((dimension) => {
    const bucketDefinitions = dimension.getBuckets();
    const axisGroupIds = listResearchAxisGroups()
      .filter((group) => group.dimensionIds.includes(dimension.id))
      .map((group) => group.groupId);

    const observationsByBucket = accumulateDimensionBucketObservations(
      dimension.id,
      bucketsByGroup,
    );
    const populatedBucketIds = bucketDefinitions
      .map((definition) => definition.bucketId)
      .filter((bucketId) => (observationsByBucket.get(bucketId) ?? 0) > 0);
    const populatedCounts = populatedBucketIds.map(
      (bucketId) => observationsByBucket.get(bucketId) ?? 0,
    );
    const totalObservations = populatedCounts.reduce((sum, count) => sum + count, 0);
    const bucketCount = bucketDefinitions.length;
    const populatedBucketCount = populatedBucketIds.length;
    const hasAtlas = bucketsByGroup.size > 0;

    return {
      dimensionId: dimension.id,
      label: dimension.label,
      bucketCount,
      populatedBucketCount,
      coverage: hasAtlas ? populatedBucketCount / bucketCount : null,
      observationCount: totalObservations,
      sparsity: hasAtlas ? 1 - populatedBucketCount / bucketCount : null,
      entropy: computeShannonEntropy(populatedCounts),
      missingRate: hasAtlas ? 1 - populatedBucketCount / bucketCount : null,
      sampleSizes: computeSampleSizeStats(populatedCounts),
      axisGroupIds,
    };
  });
}

function countCandidatesByGroup(
  loadedInputs: LoadedResearchDimensionExplorerInputs,
): Map<string, number> {
  const counts = new Map<string, number>();

  for (const candidate of loadedInputs.hypothesisCandidates?.candidates ?? []) {
    const parsed =
      candidate.bucketMetadata?.groupId
        ? {
            groupId: candidate.bucketMetadata.groupId,
          }
        : parseAtlasHypothesisCandidateId(candidate.candidateId);

    if (!parsed) {
      continue;
    }

    counts.set(parsed.groupId, (counts.get(parsed.groupId) ?? 0) + 1);
  }

  return counts;
}

function countValidationsByGroup(
  loadedInputs: LoadedResearchDimensionExplorerInputs,
): Map<string, number> {
  const counts = new Map<string, number>();

  for (const entry of loadedInputs.hypothesisValidation?.entries ?? []) {
    const parsed = parseAtlasHypothesisCandidateId(entry.hypothesisId);
    if (!parsed) {
      continue;
    }

    counts.set(parsed.groupId, (counts.get(parsed.groupId) ?? 0) + 1);
  }

  return counts;
}

export function analyzeRegistryAxisGroups(
  loadedInputs: LoadedResearchDimensionExplorerInputs,
  bucketsByGroup: Map<string, readonly AtlasBucketSummary[]>,
): ResearchDimensionExplorerAxisGroupEntry[] {
  const candidateCounts = countCandidatesByGroup(loadedInputs);
  const validationCounts = countValidationsByGroup(loadedInputs);

  return listResearchAxisGroups().map((group) => {
    const buckets = bucketsByGroup.get(group.groupId) ?? [];
    const combinationCount = resolveAxisGroupCombinationCount(group);
    const populatedCombinations = buckets.filter((bucket) => bucket.observations > 0).length;
    const observationCounts = buckets
      .filter((bucket) => bucket.observations > 0)
      .map((bucket) => bucket.observations);

    return {
      groupId: group.groupId,
      dimensionIds: group.dimensionIds,
      combinationCount,
      populatedCombinations,
      emptyCombinations: Math.max(combinationCount - populatedCombinations, 0),
      populationRate:
        bucketsByGroup.size > 0 ? populatedCombinations / combinationCount : null,
      candidateYield: candidateCounts.get(group.groupId) ?? 0,
      validationYield: validationCounts.get(group.groupId) ?? 0,
      totalObservations: observationCounts.reduce((sum, count) => sum + count, 0),
      largestCombinationObservations: observationCounts.length > 0
        ? Math.max(...observationCounts)
        : 0,
      smallestPopulatedCombinationObservations: observationCounts.length > 0
        ? Math.min(...observationCounts)
        : null,
    };
  });
}

export function buildDimensionExplorerRecommendations(input: {
  dimensions: readonly ResearchDimensionExplorerDimensionEntry[];
  axisGroups: readonly ResearchDimensionExplorerAxisGroupEntry[];
}): ResearchDimensionExplorerRecommendation[] {
  const recommendations: ResearchDimensionExplorerRecommendation[] = [];
  let rank = 1;

  for (const dimension of input.dimensions) {
    if (
      dimension.coverage !== null
      && dimension.coverage < 0.5
      && dimension.observationCount > 0
    ) {
      recommendations.push({
        kind: "expand-dimension",
        label: `Expand ${dimension.label}`,
        rationale: `${dimension.label} covers ${Math.round((dimension.coverage ?? 0) * 100)}% of registered buckets but already has ${dimension.observationCount} observations.`,
        dimensionId: dimension.dimensionId,
        groupId: null,
        priorityRank: rank++,
      });
    }

    if (dimension.missingRate !== null && dimension.missingRate >= 0.6) {
      recommendations.push({
        kind: "poor-coverage",
        label: `Improve ${dimension.label} coverage`,
        rationale: `${Math.round((dimension.missingRate ?? 0) * 100)}% of ${dimension.label} buckets are empty in the current atlas.`,
        dimensionId: dimension.dimensionId,
        groupId: null,
        priorityRank: rank++,
      });
    }

    const candidateYield = input.axisGroups
      .filter((group) =>
        group.dimensionIds.includes(dimension.dimensionId as ResearchDimensionId),
      )
      .reduce((sum, group) => sum + group.candidateYield, 0);

    if (candidateYield >= 4) {
      recommendations.push({
        kind: "high-hypothesis-yield",
        label: `${dimension.label} produces many hypotheses`,
        rationale: `${candidateYield} hypothesis candidates map to axis groups using ${dimension.label}.`,
        dimensionId: dimension.dimensionId,
        groupId: null,
        priorityRank: rank++,
      });
    }

    if (candidateYield === 0 && dimension.observationCount > 0) {
      recommendations.push({
        kind: "zero-hypothesis-yield",
        label: `${dimension.label} produces no hypotheses`,
        rationale: `${dimension.label} has atlas coverage but no registered hypothesis candidates.`,
        dimensionId: dimension.dimensionId,
        groupId: null,
        priorityRank: rank++,
      });
    }

    if (
      dimension.sparsity !== null
      && dimension.sparsity >= 0.5
      && dimension.entropy !== null
      && dimension.entropy <= 1
    ) {
      recommendations.push({
        kind: "refine-buckets",
        label: `Refine ${dimension.label} buckets`,
        rationale: `${dimension.label} is sparse with low entropy (${dimension.entropy.toFixed(2)} bits), suggesting concentrated observations in a few buckets.`,
        dimensionId: dimension.dimensionId,
        groupId: null,
        priorityRank: rank++,
      });
    }
  }

  for (const group of input.axisGroups) {
    if (
      group.combinationCount >= 12
      && group.populationRate !== null
      && group.populationRate <= 0.35
    ) {
      recommendations.push({
        kind: "dimensionality-explosion",
        label: `${group.groupId} search space is sparse`,
        rationale: `${group.groupId} defines ${group.combinationCount} combinations but only ${group.populatedCombinations} are populated (${Math.round((group.populationRate ?? 0) * 100)}%).`,
        dimensionId: null,
        groupId: group.groupId,
        priorityRank: rank++,
      });
    }
  }

  return recommendations.sort((left, right) => {
    if (left.priorityRank !== right.priorityRank) {
      return left.priorityRank - right.priorityRank;
    }

    const leftKey = `${left.kind}:${left.dimensionId ?? ""}:${left.groupId ?? ""}`;
    const rightKey = `${right.kind}:${right.dimensionId ?? ""}:${right.groupId ?? ""}`;
    return leftKey.localeCompare(rightKey);
  });
}

export function buildDimensionExplorerVisualization(input: {
  dimensions: readonly ResearchDimensionExplorerDimensionEntry[];
  axisGroups: readonly ResearchDimensionExplorerAxisGroupEntry[];
  bucketsByGroup: Map<string, readonly AtlasBucketSummary[]>;
}): ResearchDimensionExplorerVisualization {
  const coverageHeatmap: ResearchDimensionExplorerVisualization["coverageHeatmap"][number][] = [];
  const populationHistogram: ResearchDimensionExplorerVisualization["populationHistogram"][number][] = [];
  const sparsityWarnings: ResearchDimensionExplorerVisualization["sparsityWarnings"][number][] = [];
  const largestGroups: ResearchDimensionExplorerVisualization["largestGroups"][number][] = [];
  const smallestGroups: ResearchDimensionExplorerVisualization["smallestGroups"][number][] = [];

  for (const dimension of input.dimensions) {
    if (dimension.sparsity !== null && dimension.sparsity >= 0.5) {
      sparsityWarnings.push({
        dimensionId: dimension.dimensionId,
        groupId: null,
        message: `${dimension.label} sparsity is ${Math.round((dimension.sparsity ?? 0) * 100)}%.`,
      });
    }

    const dimensionBuckets = accumulateDimensionBucketObservations(
      dimension.dimensionId as ResearchDimensionId,
      input.bucketsByGroup,
    );
    const totalObservations = [...dimensionBuckets.values()].reduce(
      (sum, count) => sum + count,
      0,
    );

    for (const [bucketId, observations] of dimensionBuckets.entries()) {
      coverageHeatmap.push({
        dimensionId: dimension.dimensionId,
        bucketId,
        observations,
        coverageShare: totalObservations > 0 ? observations / totalObservations : null,
      });
    }
  }

  for (const group of input.axisGroups) {
    if (group.populationRate !== null && group.populationRate <= 0.35) {
      sparsityWarnings.push({
        dimensionId: null,
        groupId: group.groupId,
        message: `${group.groupId} only populates ${Math.round((group.populationRate ?? 0) * 100)}% of combinations.`,
      });
    }

    for (const bucket of input.bucketsByGroup.get(group.groupId) ?? []) {
      if (bucket.observations <= 0) {
        continue;
      }

      populationHistogram.push({
        groupId: group.groupId,
        bucketId: bucket.bucketId,
        observations: bucket.observations,
      });
    }
  }

  const populatedCells = populationHistogram.sort(
    (left, right) => right.observations - left.observations,
  );

  largestGroups.push(
    ...populatedCells.slice(0, 5).map((entry) => ({
      groupId: entry.groupId,
      bucketId: entry.bucketId,
      observations: entry.observations,
    })),
  );

  smallestGroups.push(
    ...[...populatedCells]
      .sort((left, right) => left.observations - right.observations)
      .slice(0, 5)
      .map((entry) => ({
        groupId: entry.groupId,
        bucketId: entry.bucketId,
        observations: entry.observations,
      })),
  );

  return {
    dimensionGraph: input.dimensions.map((dimension) => ({
      dimensionId: dimension.dimensionId,
      label: dimension.label,
      axisGroupIds: dimension.axisGroupIds,
      bucketCount: dimension.bucketCount,
    })),
    coverageHeatmap: coverageHeatmap.sort((left, right) => {
      const dimensionCompare = left.dimensionId.localeCompare(right.dimensionId);
      if (dimensionCompare !== 0) {
        return dimensionCompare;
      }

      return left.bucketId.localeCompare(right.bucketId);
    }),
    combinationSizes: input.axisGroups.map((group) => ({
      groupId: group.groupId,
      combinationCount: group.combinationCount,
      populatedCombinations: group.populatedCombinations,
    })),
    populationHistogram: populationHistogram.sort((left, right) => {
      const groupCompare = left.groupId.localeCompare(right.groupId);
      if (groupCompare !== 0) {
        return groupCompare;
      }

      return left.bucketId.localeCompare(right.bucketId);
    }),
    sparsityWarnings,
    largestGroups,
    smallestGroups,
  };
}

export function buildAtlasGroupBucketsFromLoadedInputs(
  loadedInputs: LoadedResearchDimensionExplorerInputs,
): Map<string, readonly AtlasBucketSummary[]> {
  if (!loadedInputs.mispricingAtlas) {
    return new Map();
  }

  return buildAtlasGroupBuckets(loadedInputs.mispricingAtlas);
}
