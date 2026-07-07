import {
  buildCompositeBucketTemplates,
  COARSE_VOLATILITY_REGIME_DEFINITIONS,
  getResearchDimension,
  listResearchAxisGroups,
  observationMatchesCompositeTemplate,
  RESEARCH_AXIS_GROUPS,
} from "@/lib/data/research/dimensions";
import { buildCoarseProbabilityAxisDefinitions } from "@/lib/data/research/dimensions/bucketDefinitions";
import { probabilityFitsBucket } from "@/lib/data/research/dimensions/bucketDefinitions";
import type {
  MispricingAtlasBucketSummary,
  MispricingAtlasCoarseBuckets,
  MispricingAtlasSampleCounts,
  MispricingAtlasWarning,
  MispricingObservation,
  RegimeVolatilityByMarketKey,
} from "./mispricingAtlasTypes";

type ObservationMetrics = Pick<
  MispricingObservation,
  "predictedProbability" | "observedOutcome" | "tradingDayUtc"
>;

export type MispricingBucketAccumulator = {
  bucketId: string;
  bucketLabel: string;
  count: number;
  sumPredicted: number;
  sumOutcome: number;
  sumSquaredError: number;
  sumAbsError: number;
  tradingDays: Set<string>;
};

function roundMetric(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

export function createMispricingBucketAccumulator(
  bucketId: string,
  bucketLabel: string,
): MispricingBucketAccumulator {
  return {
    bucketId,
    bucketLabel,
    count: 0,
    sumPredicted: 0,
    sumOutcome: 0,
    sumSquaredError: 0,
    sumAbsError: 0,
    tradingDays: new Set<string>(),
  };
}

export function addObservationToMispricingBucket(
  accumulator: MispricingBucketAccumulator,
  observation: ObservationMetrics,
): void {
  accumulator.count += 1;
  accumulator.sumPredicted += observation.predictedProbability;
  accumulator.sumOutcome += observation.observedOutcome;
  const error = observation.predictedProbability - observation.observedOutcome;
  accumulator.sumSquaredError += error * error;
  accumulator.sumAbsError += Math.abs(error);

  if (observation.tradingDayUtc) {
    accumulator.tradingDays.add(observation.tradingDayUtc);
  }
}

export function finalizeMispricingBucketAccumulator(
  accumulator: MispricingBucketAccumulator,
): MispricingAtlasBucketSummary {
  if (accumulator.count === 0) {
    return {
      bucketId: accumulator.bucketId,
      bucketLabel: accumulator.bucketLabel,
      observations: 0,
      uniqueTradingDays: null,
      averageImpliedProbability: null,
      realizedFrequency: null,
      calibrationError: null,
      brierScore: null,
      averageAbsoluteError: null,
    };
  }

  const averageImpliedProbability =
    accumulator.sumPredicted / accumulator.count;
  const realizedFrequency = accumulator.sumOutcome / accumulator.count;

  return {
    bucketId: accumulator.bucketId,
    bucketLabel: accumulator.bucketLabel,
    observations: accumulator.count,
    uniqueTradingDays:
      accumulator.tradingDays.size > 0 ? accumulator.tradingDays.size : null,
    averageImpliedProbability: roundMetric(averageImpliedProbability),
    realizedFrequency: roundMetric(realizedFrequency),
    calibrationError: roundMetric(averageImpliedProbability - realizedFrequency),
    brierScore: roundMetric(accumulator.sumSquaredError / accumulator.count),
    averageAbsoluteError: roundMetric(accumulator.sumAbsError / accumulator.count),
  };
}

function finalizeAccumulatorList(
  accumulators: readonly MispricingBucketAccumulator[],
): MispricingAtlasBucketSummary[] {
  return accumulators.map((accumulator) =>
    finalizeMispricingBucketAccumulator(accumulator),
  );
}

function marketJoinKey(observation: MispricingObservation): string {
  return `${observation.strategyId}/${observation.seriesTicker}/${observation.marketTicker}`;
}

function createSingleDimensionAccumulators(
  dimensionId: import("@/lib/data/research/dimensions").ResearchDimensionId,
): MispricingBucketAccumulator[] {
  const dimension = getResearchDimension(dimensionId);
  return dimension.getBuckets().map((definition) =>
    createMispricingBucketAccumulator(definition.bucketId, definition.bucketLabel),
  );
}

function createCompositeAccumulators(
  dimensionIds: readonly import("@/lib/data/research/dimensions").ResearchDimensionId[],
): MispricingBucketAccumulator[] {
  return buildCompositeBucketTemplates(dimensionIds).map((template) =>
    createMispricingBucketAccumulator(template.bucketId, template.bucketLabel),
  );
}

function createProbabilityRegimeAccumulators(): MispricingBucketAccumulator[] {
  const accumulators: MispricingBucketAccumulator[] = [];

  for (const probabilityDefinition of buildCoarseProbabilityAxisDefinitions()) {
    for (const regimeDefinition of COARSE_VOLATILITY_REGIME_DEFINITIONS) {
      accumulators.push(
        createMispricingBucketAccumulator(
          `${probabilityDefinition.bucketId}-${regimeDefinition.bucketId}`,
          `${probabilityDefinition.bucketLabel} × ${regimeDefinition.bucketLabel}`,
        ),
      );
    }
  }

  return accumulators;
}

function ingestSingleDimensionBuckets(
  accumulators: readonly MispricingBucketAccumulator[],
  dimensionId: import("@/lib/data/research/dimensions").ResearchDimensionId,
  observation: MispricingObservation,
  metrics: ObservationMetrics,
): void {
  const dimension = getResearchDimension(dimensionId);
  const value = dimension.extractValue(observation);

  dimension.getBuckets().forEach((definition, index) => {
    if (value !== null && dimension.valueFitsBucket(value, definition)) {
      addObservationToMispricingBucket(accumulators[index]!, metrics);
    }
  });
}

function ingestCompositeDimensionBuckets(
  accumulators: readonly MispricingBucketAccumulator[],
  dimensionIds: readonly import("@/lib/data/research/dimensions").ResearchDimensionId[],
  observation: MispricingObservation,
  metrics: ObservationMetrics,
): void {
  const templates = buildCompositeBucketTemplates(dimensionIds);

  templates.forEach((template, index) => {
    if (
      observationMatchesCompositeTemplate(
        observation,
        dimensionIds,
        template.bucketDefinitions,
      )
    ) {
      addObservationToMispricingBucket(accumulators[index]!, metrics);
    }
  });
}

function ingestProbabilityRegimeBuckets(
  accumulators: readonly MispricingBucketAccumulator[],
  observation: MispricingObservation,
  metrics: ObservationMetrics,
  regimeVolatilityByMarket: RegimeVolatilityByMarketKey,
): void {
  const regimeTag = regimeVolatilityByMarket.get(marketJoinKey(observation));
  let index = 0;

  for (const probabilityDefinition of buildCoarseProbabilityAxisDefinitions()) {
    for (const regimeDefinition of COARSE_VOLATILITY_REGIME_DEFINITIONS) {
      if (
        regimeTag === regimeDefinition.regimeTag
        && probabilityFitsBucket(observation.predictedProbability, probabilityDefinition)
      ) {
        addObservationToMispricingBucket(accumulators[index]!, metrics);
      }

      index += 1;
    }
  }
}

export type MispricingAtlasIncrementalState = {
  overall: MispricingBucketAccumulator;
  probabilityBuckets: MispricingBucketAccumulator[];
  timeRemainingBuckets: MispricingBucketAccumulator[];
  moneynessBuckets: MispricingBucketAccumulator[];
  volatilityBuckets: MispricingBucketAccumulator[];
  coarseProbabilityOnly: MispricingBucketAccumulator[];
  coarseProbabilityTime: MispricingBucketAccumulator[];
  coarseProbabilityRegime: MispricingBucketAccumulator[];
  coarseProbabilityMoneyness: MispricingBucketAccumulator[];
  coarseMoneynessTime: MispricingBucketAccumulator[];
  coarseVolatilityMoneyness: MispricingBucketAccumulator[];
  coarseVolatilityProbabilityTime: MispricingBucketAccumulator[];
  warnings: MispricingAtlasWarning[];
  seenMarkets: Set<string>;
  totalObservations: number;
  skippedMissingSettlement: number;
  skippedMissingProbability: number;
  skippedMissingContext: number;
};

export function createMispricingAtlasIncrementalState(input?: {
  regimeVolatilityByMarket?: RegimeVolatilityByMarketKey;
}): MispricingAtlasIncrementalState {
  const regimeVolatilityByMarket = input?.regimeVolatilityByMarket;

  return {
    overall: createMispricingBucketAccumulator("overall", "Overall calibration"),
    probabilityBuckets: createSingleDimensionAccumulators("probability"),
    timeRemainingBuckets: createSingleDimensionAccumulators("timeRemaining"),
    moneynessBuckets: createSingleDimensionAccumulators("moneyness"),
    volatilityBuckets: createSingleDimensionAccumulators("volatility"),
    coarseProbabilityOnly: createSingleDimensionAccumulators("coarseProbability"),
    coarseProbabilityTime: createCompositeAccumulators([
      "coarseProbabilityAxis",
      "coarseTimeRemaining",
    ]),
    coarseProbabilityRegime: regimeVolatilityByMarket
      ? createProbabilityRegimeAccumulators()
      : [],
    coarseProbabilityMoneyness: createCompositeAccumulators([
      "coarseProbabilityAxis",
      "moneyness",
    ]),
    coarseMoneynessTime: createCompositeAccumulators(["moneyness", "timeRemaining"]),
    coarseVolatilityMoneyness: createCompositeAccumulators(["volatility", "moneyness"]),
    coarseVolatilityProbabilityTime: createCompositeAccumulators([
      "volatility",
      "coarseProbabilityAxis",
      "coarseTimeRemaining",
    ]),
    warnings: [],
    seenMarkets: new Set<string>(),
    totalObservations: 0,
    skippedMissingSettlement: 0,
    skippedMissingProbability: 0,
    skippedMissingContext: 0,
  };
}

export function ingestMispricingObservation(
  state: MispricingAtlasIncrementalState,
  observation: MispricingObservation,
  options?: { regimeVolatilityByMarket?: RegimeVolatilityByMarketKey },
): void {
  const regimeVolatilityByMarket = options?.regimeVolatilityByMarket;
  const metrics: ObservationMetrics = observation;

  addObservationToMispricingBucket(state.overall, metrics);
  state.totalObservations += 1;

  ingestSingleDimensionBuckets(
    state.probabilityBuckets,
    "probability",
    observation,
    metrics,
  );
  ingestSingleDimensionBuckets(
    state.timeRemainingBuckets,
    "timeRemaining",
    observation,
    metrics,
  );
  ingestSingleDimensionBuckets(state.moneynessBuckets, "moneyness", observation, metrics);
  ingestSingleDimensionBuckets(
    state.volatilityBuckets,
    "volatility",
    observation,
    metrics,
  );
  ingestSingleDimensionBuckets(
    state.coarseProbabilityOnly,
    "coarseProbability",
    observation,
    metrics,
  );

  ingestCompositeDimensionBuckets(
    state.coarseProbabilityTime,
    ["coarseProbabilityAxis", "coarseTimeRemaining"],
    observation,
    metrics,
  );

  if (regimeVolatilityByMarket) {
    ingestProbabilityRegimeBuckets(
      state.coarseProbabilityRegime,
      observation,
      metrics,
      regimeVolatilityByMarket,
    );
  }

  ingestCompositeDimensionBuckets(
    state.coarseProbabilityMoneyness,
    ["coarseProbabilityAxis", "moneyness"],
    observation,
    metrics,
  );
  ingestCompositeDimensionBuckets(
    state.coarseMoneynessTime,
    ["moneyness", "timeRemaining"],
    observation,
    metrics,
  );
  ingestCompositeDimensionBuckets(
    state.coarseVolatilityMoneyness,
    ["volatility", "moneyness"],
    observation,
    metrics,
  );
  ingestCompositeDimensionBuckets(
    state.coarseVolatilityProbabilityTime,
    ["volatility", "coarseProbabilityAxis", "coarseTimeRemaining"],
    observation,
    metrics,
  );
}

export function ingestMispricingMarketExtraction(
  state: MispricingAtlasIncrementalState,
  input: {
    strategyId: string;
    seriesTicker: string;
    marketTicker: string;
    observations: readonly MispricingObservation[];
    warnings: readonly MispricingAtlasWarning[];
  },
  options?: { regimeVolatilityByMarket?: RegimeVolatilityByMarketKey },
): void {
  state.seenMarkets.add(`${input.strategyId}/${input.seriesTicker}/${input.marketTicker}`);

  for (const warning of input.warnings) {
    state.warnings.push(warning);

    if (warning.code === "missing-settlement") {
      state.skippedMissingSettlement += 1;
    } else if (warning.code === "missing-probability") {
      state.skippedMissingProbability += 1;
    } else if (warning.code === "missing-context") {
      state.skippedMissingContext += 1;
    }
  }

  for (const observation of input.observations) {
    ingestMispricingObservation(state, observation, options);
  }
}

export function finalizeMispricingAtlasIncrementalState(
  state: MispricingAtlasIncrementalState,
): {
  sampleCounts: MispricingAtlasSampleCounts;
  overallCalibration: MispricingAtlasBucketSummary;
  probabilityBuckets: MispricingAtlasBucketSummary[];
  timeRemainingBuckets: MispricingAtlasBucketSummary[];
  moneynessBuckets: MispricingAtlasBucketSummary[];
  volatilityBuckets: MispricingAtlasBucketSummary[];
  coarseBuckets: MispricingAtlasCoarseBuckets;
  warnings: MispricingAtlasWarning[];
} {
  return {
    sampleCounts: {
      totalObservations: state.totalObservations,
      marketCount: state.seenMarkets.size,
      skippedMissingSettlement: state.skippedMissingSettlement,
      skippedMissingProbability: state.skippedMissingProbability,
      skippedMissingContext: state.skippedMissingContext,
    },
    overallCalibration: finalizeMispricingBucketAccumulator(state.overall),
    probabilityBuckets: finalizeAccumulatorList(state.probabilityBuckets),
    timeRemainingBuckets: finalizeAccumulatorList(state.timeRemainingBuckets),
    moneynessBuckets: finalizeAccumulatorList(state.moneynessBuckets),
    volatilityBuckets: finalizeAccumulatorList(state.volatilityBuckets),
    coarseBuckets: {
      probabilityOnly: finalizeAccumulatorList(state.coarseProbabilityOnly),
      probabilityTime: finalizeAccumulatorList(state.coarseProbabilityTime),
      probabilityRegime: finalizeAccumulatorList(state.coarseProbabilityRegime),
      probabilityMoneyness: finalizeAccumulatorList(state.coarseProbabilityMoneyness),
      moneynessTime: finalizeAccumulatorList(state.coarseMoneynessTime),
      volatilityMoneyness: finalizeAccumulatorList(state.coarseVolatilityMoneyness),
      volatilityProbabilityTime: finalizeAccumulatorList(
        state.coarseVolatilityProbabilityTime,
      ),
    },
    warnings: sortMispricingAtlasWarnings(state.warnings),
  };
}

function sortMispricingAtlasWarnings(
  warnings: readonly MispricingAtlasWarning[],
): MispricingAtlasWarning[] {
  return [...warnings].sort((left, right) => {
    const marketCompare = (left.marketTicker ?? "").localeCompare(
      right.marketTicker ?? "",
    );
    if (marketCompare !== 0) {
      return marketCompare;
    }

    return left.message.localeCompare(right.message);
  });
}

// Registry alignment guard for tests.
export const RESEARCH_AXIS_GROUP_COUNT = RESEARCH_AXIS_GROUPS.length;
export const RESEARCH_AXIS_GROUP_LIST = listResearchAxisGroups();
