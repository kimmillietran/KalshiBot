import {
  createAccumulatorsForAxisGroup,
  ingestObservationForAxisGroup,
  listRegistryAxisGroupsForAtlas,
} from "@/lib/data/research/dimensions/registryAtlasIntegration";
import { RESEARCH_AXIS_GROUPS } from "@/lib/data/research/dimensions";
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

export type MispricingAtlasIncrementalState = {
  overall: MispricingBucketAccumulator;
  axisAccumulators: Map<string, MispricingBucketAccumulator[]>;
  warnings: MispricingAtlasWarning[];
  seenMarkets: Set<string>;
  totalObservations: number;
  skippedMissingSettlement: number;
  skippedMissingProbability: number;
  skippedMissingContext: number;
};

function axisStateKey(group: (typeof RESEARCH_AXIS_GROUPS)[number]): string {
  return group.atlasSource.stateKey;
}

export function createMispricingAtlasIncrementalState(input?: {
  regimeVolatilityByMarket?: RegimeVolatilityByMarketKey;
}): MispricingAtlasIncrementalState {
  const regimeVolatilityByMarket = input?.regimeVolatilityByMarket;
  const axisAccumulators = new Map<string, MispricingBucketAccumulator[]>();

  for (const group of listRegistryAxisGroupsForAtlas()) {
    if (group.requiresRegimeVolatility && !regimeVolatilityByMarket) {
      axisAccumulators.set(axisStateKey(group), []);
      continue;
    }

    axisAccumulators.set(
      axisStateKey(group),
      createAccumulatorsForAxisGroup(group) as MispricingBucketAccumulator[],
    );
  }

  return {
    overall: createMispricingBucketAccumulator("overall", "Overall calibration"),
    axisAccumulators,
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

  for (const group of listRegistryAxisGroupsForAtlas()) {
    if (group.requiresRegimeVolatility && !regimeVolatilityByMarket) {
      continue;
    }

    const accumulators = state.axisAccumulators.get(axisStateKey(group));
    if (!accumulators || accumulators.length === 0) {
      continue;
    }

    ingestObservationForAxisGroup({
      group,
      accumulators,
      observation,
      metrics,
      addObservation: addObservationToMispricingBucket,
      regimeVolatilityByMarket,
    });
  }
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

function readAxisSummaries(
  state: MispricingAtlasIncrementalState,
  stateKey: string,
): MispricingAtlasBucketSummary[] {
  return finalizeAccumulatorList(state.axisAccumulators.get(stateKey) ?? []);
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
  momentumBuckets: MispricingAtlasBucketSummary[];
  hourUtcBuckets: MispricingAtlasBucketSummary[];
  dayOfWeekUtcBuckets: MispricingAtlasBucketSummary[];
  sessionBucketBuckets: MispricingAtlasBucketSummary[];
  weekendFlagBuckets: MispricingAtlasBucketSummary[];
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
    probabilityBuckets: readAxisSummaries(state, "probabilityBuckets"),
    timeRemainingBuckets: readAxisSummaries(state, "timeRemainingBuckets"),
    moneynessBuckets: readAxisSummaries(state, "moneynessBuckets"),
    volatilityBuckets: readAxisSummaries(state, "volatilityBuckets"),
    momentumBuckets: readAxisSummaries(state, "momentumBuckets"),
    hourUtcBuckets: readAxisSummaries(state, "hourUtcBuckets"),
    dayOfWeekUtcBuckets: readAxisSummaries(state, "dayOfWeekUtcBuckets"),
    sessionBucketBuckets: readAxisSummaries(state, "sessionBucketBuckets"),
    weekendFlagBuckets: readAxisSummaries(state, "weekendFlagBuckets"),
    coarseBuckets: {
      probabilityOnly: readAxisSummaries(state, "coarseProbabilityOnly"),
      probabilityTime: readAxisSummaries(state, "coarseProbabilityTime"),
      probabilityRegime: readAxisSummaries(state, "coarseProbabilityRegime"),
      probabilityMoneyness: readAxisSummaries(state, "coarseProbabilityMoneyness"),
      moneynessTime: readAxisSummaries(state, "coarseMoneynessTime"),
      volatilityMoneyness: readAxisSummaries(state, "coarseVolatilityMoneyness"),
      volatilityProbabilityTime: readAxisSummaries(state, "coarseVolatilityProbabilityTime"),
      probabilityMomentum: readAxisSummaries(state, "coarseProbabilityMomentum"),
      momentumTime: readAxisSummaries(state, "coarseMomentumTime"),
      momentumVolatility: readAxisSummaries(state, "coarseMomentumVolatility"),
      probabilityMomentumTime: readAxisSummaries(state, "coarseProbabilityMomentumTime"),
      probabilityHour: readAxisSummaries(state, "coarseProbabilityHour"),
      probabilityWeekday: readAxisSummaries(state, "coarseProbabilityWeekday"),
      momentumHour: readAxisSummaries(state, "coarseMomentumHour"),
      timeRemainingHour: readAxisSummaries(state, "coarseTimeRemainingHour"),
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

export const RESEARCH_AXIS_GROUP_COUNT = RESEARCH_AXIS_GROUPS.length;
