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
} from "./mispricingAtlasBuckets";
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
  const probabilityDefinitions = buildProbabilityBucketDefinitions();
  const coarseProbabilityDefinitions = buildCoarseProbabilityBucketDefinitions();
  const coarseProbabilityAxisDefinitions = buildCoarseProbabilityAxisDefinitions();
  const regimeVolatilityByMarket = input?.regimeVolatilityByMarket;

  const coarseProbabilityTime: MispricingBucketAccumulator[] = [];
  for (const probabilityDefinition of coarseProbabilityAxisDefinitions) {
    for (const timeDefinition of COARSE_TIME_REMAINING_AXIS_DEFINITIONS) {
      coarseProbabilityTime.push(
        createMispricingBucketAccumulator(
          `${probabilityDefinition.bucketId}-${timeDefinition.bucketId}`,
          `${probabilityDefinition.bucketLabel} × ${timeDefinition.bucketLabel}`,
        ),
      );
    }
  }

  const coarseProbabilityRegime: MispricingBucketAccumulator[] = [];
  if (regimeVolatilityByMarket) {
    for (const probabilityDefinition of coarseProbabilityAxisDefinitions) {
      for (const regimeDefinition of COARSE_VOLATILITY_REGIME_DEFINITIONS) {
        coarseProbabilityRegime.push(
          createMispricingBucketAccumulator(
            `${probabilityDefinition.bucketId}-${regimeDefinition.bucketId}`,
            `${probabilityDefinition.bucketLabel} × ${regimeDefinition.bucketLabel}`,
          ),
        );
      }
    }
  }

  const coarseProbabilityMoneyness: MispricingBucketAccumulator[] = [];
  for (const probabilityDefinition of coarseProbabilityAxisDefinitions) {
    for (const moneynessDefinition of MONEYNESS_BUCKET_DEFINITIONS) {
      coarseProbabilityMoneyness.push(
        createMispricingBucketAccumulator(
          `${probabilityDefinition.bucketId}-${moneynessDefinition.bucketId}`,
          `${probabilityDefinition.bucketLabel} × ${moneynessDefinition.bucketLabel}`,
        ),
      );
    }
  }

  const coarseMoneynessTime: MispricingBucketAccumulator[] = [];
  for (const moneynessDefinition of MONEYNESS_BUCKET_DEFINITIONS) {
    for (const timeDefinition of TIME_REMAINING_BUCKET_DEFINITIONS) {
      coarseMoneynessTime.push(
        createMispricingBucketAccumulator(
          `${moneynessDefinition.bucketId}-${timeDefinition.bucketId}`,
          `${moneynessDefinition.bucketLabel} × ${timeDefinition.bucketLabel}`,
        ),
      );
    }
  }

  const coarseVolatilityMoneyness: MispricingBucketAccumulator[] = [];
  for (const volatilityDefinition of VOLATILITY_BUCKET_DEFINITIONS) {
    for (const moneynessDefinition of MONEYNESS_BUCKET_DEFINITIONS) {
      coarseVolatilityMoneyness.push(
        createMispricingBucketAccumulator(
          `${volatilityDefinition.bucketId}-${moneynessDefinition.bucketId}`,
          `${volatilityDefinition.bucketLabel} × ${moneynessDefinition.bucketLabel}`,
        ),
      );
    }
  }

  const coarseVolatilityProbabilityTime: MispricingBucketAccumulator[] = [];
  for (const volatilityDefinition of VOLATILITY_BUCKET_DEFINITIONS) {
    for (const probabilityDefinition of coarseProbabilityAxisDefinitions) {
      for (const timeDefinition of COARSE_TIME_REMAINING_AXIS_DEFINITIONS) {
        coarseVolatilityProbabilityTime.push(
          createMispricingBucketAccumulator(
            `${volatilityDefinition.bucketId}-${probabilityDefinition.bucketId}-${timeDefinition.bucketId}`,
            `${volatilityDefinition.bucketLabel} × ${probabilityDefinition.bucketLabel} × ${timeDefinition.bucketLabel}`,
          ),
        );
      }
    }
  }

  return {
    overall: createMispricingBucketAccumulator("overall", "Overall calibration"),
    probabilityBuckets: probabilityDefinitions.map((definition) =>
      createMispricingBucketAccumulator(definition.bucketId, definition.bucketLabel),
    ),
    timeRemainingBuckets: TIME_REMAINING_BUCKET_DEFINITIONS.map((definition) =>
      createMispricingBucketAccumulator(definition.bucketId, definition.bucketLabel),
    ),
    moneynessBuckets: MONEYNESS_BUCKET_DEFINITIONS.map((definition) =>
      createMispricingBucketAccumulator(definition.bucketId, definition.bucketLabel),
    ),
    volatilityBuckets: VOLATILITY_BUCKET_DEFINITIONS.map((definition) =>
      createMispricingBucketAccumulator(definition.bucketId, definition.bucketLabel),
    ),
    coarseProbabilityOnly: coarseProbabilityDefinitions.map((definition) =>
      createMispricingBucketAccumulator(definition.bucketId, definition.bucketLabel),
    ),
    coarseProbabilityTime,
    coarseProbabilityRegime,
    coarseProbabilityMoneyness,
    coarseMoneynessTime,
    coarseVolatilityMoneyness,
    coarseVolatilityProbabilityTime,
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

  const probabilityDefinitions = buildProbabilityBucketDefinitions();
  for (const [index, definition] of probabilityDefinitions.entries()) {
    if (probabilityFitsBucket(observation.predictedProbability, definition)) {
      addObservationToMispricingBucket(state.probabilityBuckets[index]!, metrics);
    }
  }

  for (const [index, definition] of TIME_REMAINING_BUCKET_DEFINITIONS.entries()) {
    if (
      observation.timeRemainingMs !== null
      && valueFitsBucket(observation.timeRemainingMs, definition)
    ) {
      addObservationToMispricingBucket(state.timeRemainingBuckets[index]!, metrics);
    }
  }

  for (const [index, definition] of MONEYNESS_BUCKET_DEFINITIONS.entries()) {
    if (
      observation.moneynessPercent !== null
      && valueFitsBucket(observation.moneynessPercent, definition)
    ) {
      addObservationToMispricingBucket(state.moneynessBuckets[index]!, metrics);
    }
  }

  for (const [index, definition] of VOLATILITY_BUCKET_DEFINITIONS.entries()) {
    if (
      observation.annualizedVolatility !== null
      && valueFitsBucket(observation.annualizedVolatility, definition)
    ) {
      addObservationToMispricingBucket(state.volatilityBuckets[index]!, metrics);
    }
  }

  const coarseProbabilityDefinitions = buildCoarseProbabilityBucketDefinitions();
  for (const [index, definition] of coarseProbabilityDefinitions.entries()) {
    if (probabilityFitsBucket(observation.predictedProbability, definition)) {
      addObservationToMispricingBucket(state.coarseProbabilityOnly[index]!, metrics);
    }
  }

  const coarseProbabilityAxisDefinitions = buildCoarseProbabilityAxisDefinitions();
  let coarseProbabilityTimeIndex = 0;
  for (const probabilityDefinition of coarseProbabilityAxisDefinitions) {
    for (const timeDefinition of COARSE_TIME_REMAINING_AXIS_DEFINITIONS) {
      if (
        observation.timeRemainingMs !== null
        && probabilityFitsBucket(observation.predictedProbability, probabilityDefinition)
        && valueFitsBucket(observation.timeRemainingMs, timeDefinition)
      ) {
        addObservationToMispricingBucket(
          state.coarseProbabilityTime[coarseProbabilityTimeIndex]!,
          metrics,
        );
      }

      coarseProbabilityTimeIndex += 1;
    }
  }

  if (regimeVolatilityByMarket) {
    const regimeTag = regimeVolatilityByMarket.get(marketJoinKey(observation));
    let coarseProbabilityRegimeIndex = 0;

    for (const probabilityDefinition of coarseProbabilityAxisDefinitions) {
      for (const regimeDefinition of COARSE_VOLATILITY_REGIME_DEFINITIONS) {
        if (
          regimeTag === regimeDefinition.regimeTag
          && probabilityFitsBucket(observation.predictedProbability, probabilityDefinition)
        ) {
          addObservationToMispricingBucket(
            state.coarseProbabilityRegime[coarseProbabilityRegimeIndex]!,
            metrics,
          );
        }

        coarseProbabilityRegimeIndex += 1;
      }
    }
  }

  let coarseProbabilityMoneynessIndex = 0;
  for (const probabilityDefinition of coarseProbabilityAxisDefinitions) {
    for (const moneynessDefinition of MONEYNESS_BUCKET_DEFINITIONS) {
      if (
        observation.moneynessPercent !== null
        && probabilityFitsBucket(observation.predictedProbability, probabilityDefinition)
        && valueFitsBucket(observation.moneynessPercent, moneynessDefinition)
      ) {
        addObservationToMispricingBucket(
          state.coarseProbabilityMoneyness[coarseProbabilityMoneynessIndex]!,
          metrics,
        );
      }

      coarseProbabilityMoneynessIndex += 1;
    }
  }

  let coarseMoneynessTimeIndex = 0;
  for (const moneynessDefinition of MONEYNESS_BUCKET_DEFINITIONS) {
    for (const timeDefinition of TIME_REMAINING_BUCKET_DEFINITIONS) {
      if (
        observation.moneynessPercent !== null
        && observation.timeRemainingMs !== null
        && valueFitsBucket(observation.moneynessPercent, moneynessDefinition)
        && valueFitsBucket(observation.timeRemainingMs, timeDefinition)
      ) {
        addObservationToMispricingBucket(
          state.coarseMoneynessTime[coarseMoneynessTimeIndex]!,
          metrics,
        );
      }

      coarseMoneynessTimeIndex += 1;
    }
  }

  let coarseVolatilityMoneynessIndex = 0;
  for (const volatilityDefinition of VOLATILITY_BUCKET_DEFINITIONS) {
    for (const moneynessDefinition of MONEYNESS_BUCKET_DEFINITIONS) {
      if (
        observation.annualizedVolatility !== null
        && observation.moneynessPercent !== null
        && valueFitsBucket(observation.annualizedVolatility, volatilityDefinition)
        && valueFitsBucket(observation.moneynessPercent, moneynessDefinition)
      ) {
        addObservationToMispricingBucket(
          state.coarseVolatilityMoneyness[coarseVolatilityMoneynessIndex]!,
          metrics,
        );
      }

      coarseVolatilityMoneynessIndex += 1;
    }
  }

  let coarseVolatilityProbabilityTimeIndex = 0;
  for (const volatilityDefinition of VOLATILITY_BUCKET_DEFINITIONS) {
    for (const probabilityDefinition of coarseProbabilityAxisDefinitions) {
      for (const timeDefinition of COARSE_TIME_REMAINING_AXIS_DEFINITIONS) {
        if (
          observation.annualizedVolatility !== null
          && observation.timeRemainingMs !== null
          && valueFitsBucket(observation.annualizedVolatility, volatilityDefinition)
          && probabilityFitsBucket(observation.predictedProbability, probabilityDefinition)
          && valueFitsBucket(observation.timeRemainingMs, timeDefinition)
        ) {
          addObservationToMispricingBucket(
            state.coarseVolatilityProbabilityTime[coarseVolatilityProbabilityTimeIndex]!,
            metrics,
          );
        }

        coarseVolatilityProbabilityTimeIndex += 1;
      }
    }
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
      volatilityProbabilityTime: finalizeAccumulatorList(state.coarseVolatilityProbabilityTime),
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
