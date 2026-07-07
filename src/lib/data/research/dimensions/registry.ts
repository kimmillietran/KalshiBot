import {
  DEFAULT_HYPOTHESIS_MIN_SAMPLE_SIZE,
  DEFAULT_TRIPLE_AXIS_MIN_SAMPLE_SIZE,
  HYPOTHESIS_ATLAS_GROUP_IDS,
  type HypothesisAtlasGroupId,
} from "@/lib/data/research/hypothesisCandidates/hypothesisCandidateTypes";
import type { MispricingObservation } from "@/lib/data/research/mispricingAtlas/mispricingAtlasTypes";
import type { NormalizedMispricingAtlas } from "@/lib/data/research/hypothesisCandidates/normalizeMispricingAtlas";
import type { MispricingAtlasBucketSummary } from "@/lib/data/research/mispricingAtlas/mispricingAtlasTypes";

import {
  buildCoarseProbabilityAxisDefinitions,
  buildCoarseProbabilityBucketDefinitions,
  buildProbabilityBucketDefinitions,
  COARSE_TIME_REMAINING_AXIS_DEFINITIONS,
  COARSE_VOLATILITY_REGIME_DEFINITIONS,
  MONEYNESS_BUCKET_DEFINITIONS,
  probabilityFitsBucket,
  TIME_REMAINING_BUCKET_DEFINITIONS,
  valueFitsBucket,
  VOLATILITY_BUCKET_DEFINITIONS,
} from "./bucketDefinitions";
import { extractDimensionValue } from "./extractors";
import {
  observationMatchesDimensionBuckets,
  observationMatchesMultiAxisBucket,
  observationMatchesSingleDimensionBucket,
} from "./matchers";
import type {
  ResearchAxisGroup,
  ResearchDimension,
  ResearchDimensionId,
  ResearchMatcherAxisId,
} from "./types";

export const MATCHER_AXIS_TO_DIMENSION_ID: Record<
  ResearchMatcherAxisId,
  ResearchDimensionId
> = {
  probability: "coarseProbabilityAxis",
  time: "coarseTimeRemaining",
  moneyness: "moneyness",
  volatility: "volatility",
};

const RESEARCH_DIMENSIONS_INTERNAL: readonly ResearchDimension[] = [
  {
    id: "probability",
    label: "Probability",
    getBuckets: buildProbabilityBucketDefinitions,
    extractValue: (observation) => extractDimensionValue("probability", observation),
    valueFitsBucket: probabilityFitsBucket,
  },
  {
    id: "coarseProbability",
    label: "Coarse probability",
    getBuckets: buildCoarseProbabilityBucketDefinitions,
    extractValue: (observation) => extractDimensionValue("coarseProbability", observation),
    valueFitsBucket: probabilityFitsBucket,
  },
  {
    id: "coarseProbabilityAxis",
    label: "Coarse probability axis",
    getBuckets: buildCoarseProbabilityAxisDefinitions,
    extractValue: (observation) =>
      extractDimensionValue("coarseProbabilityAxis", observation),
    valueFitsBucket: probabilityFitsBucket,
  },
  {
    id: "timeRemaining",
    label: "Time remaining",
    getBuckets: () => TIME_REMAINING_BUCKET_DEFINITIONS,
    extractValue: (observation) => extractDimensionValue("timeRemaining", observation),
    valueFitsBucket: valueFitsBucket,
  },
  {
    id: "coarseTimeRemaining",
    label: "Coarse time remaining",
    getBuckets: () => COARSE_TIME_REMAINING_AXIS_DEFINITIONS,
    extractValue: (observation) =>
      extractDimensionValue("coarseTimeRemaining", observation),
    valueFitsBucket: valueFitsBucket,
  },
  {
    id: "moneyness",
    label: "Moneyness",
    getBuckets: () => MONEYNESS_BUCKET_DEFINITIONS,
    extractValue: (observation) => extractDimensionValue("moneyness", observation),
    valueFitsBucket: valueFitsBucket,
  },
  {
    id: "volatility",
    label: "Volatility",
    getBuckets: () => VOLATILITY_BUCKET_DEFINITIONS,
    extractValue: (observation) => extractDimensionValue("volatility", observation),
    valueFitsBucket: valueFitsBucket,
  },
];

export const RESEARCH_DIMENSIONS: readonly ResearchDimension[] =
  RESEARCH_DIMENSIONS_INTERNAL;

export const RESEARCH_AXIS_GROUPS: readonly ResearchAxisGroup[] = [
  {
    groupId: "probabilityOnly",
    dimensionIds: ["coarseProbability"],
    atlasSource: {
      kind: "coarse",
      coarseBucketsKey: "probabilityOnly",
      stateKey: "coarseProbabilityOnly",
    },
    matcherAxes: ["probability"],
  },
  {
    groupId: "probabilityTime",
    dimensionIds: ["coarseProbabilityAxis", "coarseTimeRemaining"],
    atlasSource: {
      kind: "coarse",
      coarseBucketsKey: "probabilityTime",
      stateKey: "coarseProbabilityTime",
    },
    matcherAxes: ["probability", "time"],
  },
  {
    groupId: "probabilityRegime",
    dimensionIds: ["coarseProbabilityAxis"],
    atlasSource: {
      kind: "coarse",
      coarseBucketsKey: "probabilityRegime",
      stateKey: "coarseProbabilityRegime",
    },
    matcherAxes: ["probability"],
    requiresRegimeVolatility: true,
  },
  {
    groupId: "probabilityMoneyness",
    dimensionIds: ["coarseProbabilityAxis", "moneyness"],
    atlasSource: {
      kind: "coarse",
      coarseBucketsKey: "probabilityMoneyness",
      stateKey: "coarseProbabilityMoneyness",
    },
    matcherAxes: ["probability", "moneyness"],
  },
  {
    groupId: "moneynessTime",
    dimensionIds: ["moneyness", "timeRemaining"],
    atlasSource: {
      kind: "coarse",
      coarseBucketsKey: "moneynessTime",
      stateKey: "coarseMoneynessTime",
    },
    matcherAxes: ["moneyness", "time"],
  },
  {
    groupId: "volatilityMoneyness",
    dimensionIds: ["volatility", "moneyness"],
    atlasSource: {
      kind: "coarse",
      coarseBucketsKey: "volatilityMoneyness",
      stateKey: "coarseVolatilityMoneyness",
    },
    matcherAxes: ["volatility", "moneyness"],
  },
  {
    groupId: "volatilityProbabilityTime",
    dimensionIds: ["volatility", "coarseProbabilityAxis", "coarseTimeRemaining"],
    atlasSource: {
      kind: "coarse",
      coarseBucketsKey: "volatilityProbabilityTime",
      stateKey: "coarseVolatilityProbabilityTime",
    },
    matcherAxes: ["volatility", "probability", "time"],
  },
  {
    groupId: "probability",
    dimensionIds: ["probability"],
    atlasSource: { kind: "singleAxis", stateKey: "probabilityBuckets" },
    matcherAxes: ["probability"],
  },
  {
    groupId: "timeRemaining",
    dimensionIds: ["timeRemaining"],
    atlasSource: { kind: "singleAxis", stateKey: "timeRemainingBuckets" },
    matcherAxes: ["time"],
  },
  {
    groupId: "moneyness",
    dimensionIds: ["moneyness"],
    atlasSource: { kind: "singleAxis", stateKey: "moneynessBuckets" },
    matcherAxes: ["moneyness"],
  },
  {
    groupId: "volatility",
    dimensionIds: ["volatility"],
    atlasSource: { kind: "singleAxis", stateKey: "volatilityBuckets" },
    matcherAxes: ["volatility"],
  },
];

const DIMENSION_BY_ID = new Map(
  RESEARCH_DIMENSIONS.map((dimension) => [dimension.id, dimension]),
);

const AXIS_GROUP_BY_ID = new Map(
  RESEARCH_AXIS_GROUPS.map((group) => [group.groupId, group]),
);

export function getResearchDimension(
  dimensionId: ResearchDimensionId,
): ResearchDimension {
  const dimension = DIMENSION_BY_ID.get(dimensionId);
  if (!dimension) {
    throw new Error(`Unknown research dimension: ${dimensionId}`);
  }

  return dimension;
}

export function getResearchAxisGroup(
  groupId: HypothesisAtlasGroupId,
): ResearchAxisGroup {
  const group = AXIS_GROUP_BY_ID.get(groupId);
  if (!group) {
    throw new Error(`Unknown research axis group: ${groupId}`);
  }

  return group;
}

export function listResearchAxisGroups(): readonly ResearchAxisGroup[] {
  return RESEARCH_AXIS_GROUPS;
}

export function assertResearchAxisGroupRegistryMatchesHypothesisGroups(): void {
  const registryIds = RESEARCH_AXIS_GROUPS.map((group) => group.groupId).sort();
  const hypothesisIds = [...HYPOTHESIS_ATLAS_GROUP_IDS].sort();

  if (registryIds.join("|") !== hypothesisIds.join("|")) {
    throw new Error("Research axis group registry does not match hypothesis atlas groups.");
  }
}

export function resolveAxisGroupSampleThreshold(
  groupId: HypothesisAtlasGroupId,
  minSampleSize: number = DEFAULT_HYPOTHESIS_MIN_SAMPLE_SIZE,
): number {
  if (groupId === "volatilityProbabilityTime") {
    return DEFAULT_TRIPLE_AXIS_MIN_SAMPLE_SIZE;
  }

  return minSampleSize;
}

export type CompositeBucketTemplate = {
  bucketId: string;
  bucketLabel: string;
  bucketDefinitions: readonly import("./types").NumericBucketDefinition[];
};

/** Builds the Cartesian product of bucket cells for a dimension list. */
export function buildCompositeBucketTemplates(
  dimensionIds: readonly ResearchDimensionId[],
): CompositeBucketTemplate[] {
  const dimensions = dimensionIds.map((dimensionId) => getResearchDimension(dimensionId));
  const templates: CompositeBucketTemplate[] = [];

  function recurse(
    depth: number,
    currentDefinitions: import("./types").NumericBucketDefinition[],
  ): void {
    if (depth === dimensions.length) {
      const bucketId = currentDefinitions.map((definition) => definition.bucketId).join("-");
      const bucketLabel = currentDefinitions
        .map((definition) => definition.bucketLabel)
        .join(" × ");

      templates.push({
        bucketId,
        bucketLabel,
        bucketDefinitions: [...currentDefinitions],
      });
      return;
    }

    for (const definition of dimensions[depth]!.getBuckets()) {
      recurse(depth + 1, [...currentDefinitions, definition]);
    }
  }

  recurse(0, []);
  return templates;
}

export function collectAtlasBucketGroupsFromNormalizedAtlas(
  normalizedAtlas: NormalizedMispricingAtlas,
): Array<{
  groupId: HypothesisAtlasGroupId;
  buckets: readonly MispricingAtlasBucketSummary[];
}> {
  return RESEARCH_AXIS_GROUPS.map((group) => {
    if (group.atlasSource.kind === "singleAxis") {
      return {
        groupId: group.groupId,
        buckets: normalizedAtlas[group.atlasSource.stateKey],
      };
    }

    return {
      groupId: group.groupId,
      buckets: normalizedAtlas.coarseBuckets[group.atlasSource.coarseBucketsKey],
    };
  });
}

export function observationMatchesResearchAxisGroupBucket(input: {
  groupId: HypothesisAtlasGroupId;
  bucketId: string;
  observation: MispricingObservation;
  regimeVolatilityByMarket?: ReadonlyMap<string, "low" | "medium" | "high">;
}): boolean {
  const group = getResearchAxisGroup(input.groupId);

  if (group.dimensionIds.length === 1) {
    return observationMatchesSingleDimensionBucket(
      group.dimensionIds[0]!,
      input.bucketId,
      input.observation,
    );
  }

  if (group.groupId === "probabilityRegime") {
    const [probabilityId, regimeId] = input.bucketId.split("-coarse-regime-");
    if (!probabilityId || !regimeId) {
      return false;
    }

    const probabilityDefinition = buildCoarseProbabilityAxisDefinitions().find(
      (entry) => entry.bucketId === probabilityId,
    );
    const regimeDefinition = COARSE_VOLATILITY_REGIME_DEFINITIONS.find(
      (entry) => entry.bucketId === `coarse-regime-${regimeId}`,
    );
    const regimeTag = input.regimeVolatilityByMarket?.get(
      `${input.observation.strategyId}/${input.observation.seriesTicker}/${input.observation.marketTicker}`,
    );

    return (
      probabilityDefinition !== undefined
      && regimeDefinition !== undefined
      && regimeTag === regimeDefinition.regimeTag
      && probabilityFitsBucket(input.observation.predictedProbability, probabilityDefinition)
    );
  }

  return observationMatchesMultiAxisBucket(
    input.bucketId,
    input.observation,
    group.matcherAxes,
  );
}

export function findCompositeBucketTemplate(
  groupId: HypothesisAtlasGroupId,
  bucketId: string,
): CompositeBucketTemplate | null {
  const group = getResearchAxisGroup(groupId);
  if (group.dimensionIds.length <= 1) {
    return null;
  }

  return (
    buildCompositeBucketTemplates(group.dimensionIds).find(
      (template) => template.bucketId === bucketId,
    ) ?? null
  );
}

export function observationMatchesCompositeTemplate(
  observation: MispricingObservation,
  dimensionIds: readonly ResearchDimensionId[],
  bucketDefinitions: readonly import("./types").NumericBucketDefinition[],
): boolean {
  return observationMatchesDimensionBuckets(
    observation,
    dimensionIds,
    bucketDefinitions,
  );
}
