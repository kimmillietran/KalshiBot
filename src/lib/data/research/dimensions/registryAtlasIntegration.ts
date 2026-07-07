import {
  buildCompositeBucketTemplates,
  getResearchAxisGroup,
  getResearchDimension,
  observationMatchesCompositeTemplate,
  RESEARCH_AXIS_GROUPS,
} from "./registry";
import {
  buildCoarseProbabilityAxisDefinitions,
  COARSE_VOLATILITY_REGIME_DEFINITIONS,
  probabilityFitsBucket,
} from "./bucketDefinitions";
import type { ResearchAxisGroup, ResearchDimensionId } from "./types";

export type MispricingBucketAccumulatorLike = {
  bucketId: string;
  bucketLabel: string;
  count: number;
  sumPredicted: number;
  sumOutcome: number;
  sumSquaredError: number;
  sumAbsError: number;
  tradingDays: Set<string>;
};

export function createAccumulatorsForAxisGroup(
  group: ResearchAxisGroup,
): MispricingBucketAccumulatorLike[] {
  if (group.atlasSource.kind === "probabilityRegime") {
    const accumulators: MispricingBucketAccumulatorLike[] = [];

    for (const probabilityDefinition of buildCoarseProbabilityAxisDefinitions()) {
      for (const regimeDefinition of COARSE_VOLATILITY_REGIME_DEFINITIONS) {
        accumulators.push({
          bucketId: `${probabilityDefinition.bucketId}-${regimeDefinition.bucketId}`,
          bucketLabel: `${probabilityDefinition.bucketLabel} × ${regimeDefinition.bucketLabel}`,
          count: 0,
          sumPredicted: 0,
          sumOutcome: 0,
          sumSquaredError: 0,
          sumAbsError: 0,
          tradingDays: new Set<string>(),
        });
      }
    }

    return accumulators;
  }

  if (group.dimensionIds.length === 1) {
    const dimension = getResearchDimension(group.dimensionIds[0]!);
    return dimension.getBuckets().map((definition) => ({
      bucketId: definition.bucketId,
      bucketLabel: definition.bucketLabel,
      count: 0,
      sumPredicted: 0,
      sumOutcome: 0,
      sumSquaredError: 0,
      sumAbsError: 0,
      tradingDays: new Set<string>(),
    }));
  }

  return buildCompositeBucketTemplates(group.dimensionIds).map((template) => ({
    bucketId: template.bucketId,
    bucketLabel: template.bucketLabel,
    count: 0,
    sumPredicted: 0,
    sumOutcome: 0,
    sumSquaredError: 0,
    sumAbsError: 0,
    tradingDays: new Set<string>(),
  }));
}

export function ingestObservationForAxisGroup(input: {
  group: ResearchAxisGroup;
  accumulators: readonly MispricingBucketAccumulatorLike[];
  observation: import("@/lib/data/research/mispricingAtlas/mispricingAtlasTypes").MispricingObservation;
  metrics: Pick<
    import("@/lib/data/research/mispricingAtlas/mispricingAtlasTypes").MispricingObservation,
    "predictedProbability" | "observedOutcome" | "tradingDayUtc"
  >;
  addObservation: (
    accumulator: MispricingBucketAccumulatorLike,
    metrics: Pick<
      import("@/lib/data/research/mispricingAtlas/mispricingAtlasTypes").MispricingObservation,
      "predictedProbability" | "observedOutcome" | "tradingDayUtc"
    >,
  ) => void;
  regimeVolatilityByMarket?: ReadonlyMap<string, "low" | "medium" | "high">;
}): void {
  const { group, accumulators, observation, metrics, addObservation } = input;

  if (group.atlasSource.kind === "probabilityRegime") {
    const regimeTag = input.regimeVolatilityByMarket?.get(
      `${observation.strategyId}/${observation.seriesTicker}/${observation.marketTicker}`,
    );
    let index = 0;

    for (const probabilityDefinition of buildCoarseProbabilityAxisDefinitions()) {
      for (const regimeDefinition of COARSE_VOLATILITY_REGIME_DEFINITIONS) {
        if (
          regimeTag === regimeDefinition.regimeTag
          && probabilityFitsBucket(observation.predictedProbability, probabilityDefinition)
        ) {
          addObservation(accumulators[index]!, metrics);
        }

        index += 1;
      }
    }

    return;
  }

  if (group.dimensionIds.length === 1) {
    const dimension = getResearchDimension(group.dimensionIds[0]!);
    const value = dimension.extractValue(observation);

    dimension.getBuckets().forEach((definition, index) => {
      if (value !== null && dimension.valueFitsBucket(value, definition)) {
        addObservation(accumulators[index]!, metrics);
      }
    });

    return;
  }

  const templates = buildCompositeBucketTemplates(group.dimensionIds);
  templates.forEach((template, index) => {
    if (
      observationMatchesCompositeTemplate(
        observation,
        group.dimensionIds,
        template.bucketDefinitions,
      )
    ) {
      addObservation(accumulators[index]!, metrics);
    }
  });
}

export function listRegistryAxisGroupsForAtlas(): readonly ResearchAxisGroup[] {
  return RESEARCH_AXIS_GROUPS;
}

export function resolveAxisGroupByStateKey(
  stateKey: string,
): ResearchAxisGroup | undefined {
  return listRegistryAxisGroupsForAtlas().find((group) => {
    if (group.atlasSource.kind === "singleAxis") {
      return group.atlasSource.stateKey === stateKey;
    }

    return group.atlasSource.stateKey === stateKey;
  });
}

export function dimensionIdsForGroup(groupId: ResearchAxisGroup["groupId"]): readonly ResearchDimensionId[] {
  return getResearchAxisGroup(groupId).dimensionIds;
}
