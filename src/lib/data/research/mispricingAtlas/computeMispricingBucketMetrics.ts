import {
  buildCalibrationBins,
  computeBrierScore,
} from "@/lib/data/research/calibration/computeCalibrationMetrics";

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
  MispricingObservation,
  RegimeVolatilityByMarketKey,
} from "./mispricingAtlasTypes";

function roundMetric(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function average(values: readonly number[]): number | null {
  if (values.length === 0) {
    return null;
  }

  return values.reduce((total, value) => total + value, 0) / values.length;
}

function computeAverageAbsoluteError(
  observations: readonly Pick<MispricingObservation, "predictedProbability" | "observedOutcome">[],
): number | null {
  if (observations.length === 0) {
    return null;
  }

  const total = observations.reduce((sum, observation) => {
    return (
      sum
      + Math.abs(observation.predictedProbability - observation.observedOutcome)
    );
  }, 0);

  return roundMetric(total / observations.length);
}

function computeSignedCalibrationGap(
  averageImpliedProbability: number | null,
  realizedFrequency: number | null,
): number | null {
  if (averageImpliedProbability === null || realizedFrequency === null) {
    return null;
  }

  return roundMetric(averageImpliedProbability - realizedFrequency);
}

function countUniqueTradingDays(
  observations: readonly MispricingObservation[],
): number | null {
  const days = new Set<string>();

  for (const observation of observations) {
    if (observation.tradingDayUtc) {
      days.add(observation.tradingDayUtc);
    }
  }

  return days.size > 0 ? days.size : null;
}

export function computeMispricingBucketSummary(
  bucketId: string,
  bucketLabel: string,
  observations: readonly MispricingObservation[],
): MispricingAtlasBucketSummary {
  const predictedValues = observations.map(
    (observation) => observation.predictedProbability,
  );
  const outcomeValues = observations.map(
    (observation) => observation.observedOutcome,
  );
  const averageImpliedProbability = average(predictedValues);
  const realizedFrequency = average(outcomeValues);

  return {
    bucketId,
    bucketLabel,
    observations: observations.length,
    uniqueTradingDays: countUniqueTradingDays(observations),
    averageImpliedProbability:
      averageImpliedProbability === null
        ? null
        : roundMetric(averageImpliedProbability),
    realizedFrequency:
      realizedFrequency === null ? null : roundMetric(realizedFrequency),
    calibrationError: computeSignedCalibrationGap(
      averageImpliedProbability,
      realizedFrequency,
    ),
    brierScore: computeBrierScore(observations),
    averageAbsoluteError: computeAverageAbsoluteError(observations),
  };
}

export function computeOverallMispricingCalibration(
  observations: readonly MispricingObservation[],
): MispricingAtlasBucketSummary {
  return computeMispricingBucketSummary(
    "overall",
    "Overall calibration",
    observations,
  );
}

export function computeProbabilityBucketSummaries(
  observations: readonly MispricingObservation[],
): MispricingAtlasBucketSummary[] {
  const definitions = buildProbabilityBucketDefinitions();

  return definitions.map((definition) => {
    const inBucket = observations.filter((observation) =>
      probabilityFitsBucket(observation.predictedProbability, definition),
    );

    return computeMispricingBucketSummary(
      definition.bucketId,
      definition.bucketLabel,
      inBucket,
    );
  });
}

function computeNumericAxisBucketSummaries(
  observations: readonly MispricingObservation[],
  definitions: readonly import("./mispricingAtlasBuckets").NumericBucketDefinition[],
  readValue: (observation: MispricingObservation) => number | null,
): MispricingAtlasBucketSummary[] {
  return definitions.map((definition) => {
    const inBucket = observations.filter((observation) => {
      const value = readValue(observation);
      return value !== null && valueFitsBucket(value, definition);
    });

    return computeMispricingBucketSummary(
      definition.bucketId,
      definition.bucketLabel,
      inBucket,
    );
  });
}

export function computeTimeRemainingBucketSummaries(
  observations: readonly MispricingObservation[],
): MispricingAtlasBucketSummary[] {
  return computeNumericAxisBucketSummaries(
    observations,
    TIME_REMAINING_BUCKET_DEFINITIONS,
    (observation) => observation.timeRemainingMs,
  );
}

export function computeMoneynessBucketSummaries(
  observations: readonly MispricingObservation[],
): MispricingAtlasBucketSummary[] {
  return computeNumericAxisBucketSummaries(
    observations,
    MONEYNESS_BUCKET_DEFINITIONS,
    (observation) => observation.moneynessPercent,
  );
}

export function computeVolatilityBucketSummaries(
  observations: readonly MispricingObservation[],
): MispricingAtlasBucketSummary[] {
  return computeNumericAxisBucketSummaries(
    observations,
    VOLATILITY_BUCKET_DEFINITIONS,
    (observation) => observation.annualizedVolatility,
  );
}

export function buildProbabilityReliabilityFromBins(
  observations: readonly MispricingObservation[],
): MispricingAtlasBucketSummary[] {
  const bins = buildCalibrationBins(observations);

  return bins.map((bin) =>
    computeMispricingBucketSummary(
      `prob-${bin.binIndex}`,
      `[${bin.binStart.toFixed(1)}, ${bin.binEnd.toFixed(1)}${
        bin.binIndex === bins.length - 1 ? "]" : ")"
      }`,
      observations.filter((observation) => {
        const probability = observation.predictedProbability;
        if (bin.binIndex === bins.length - 1) {
          return probability >= bin.binStart && probability <= bin.binEnd;
        }

        return probability >= bin.binStart && probability < bin.binEnd;
      }),
    ),
  );
}

function marketJoinKey(observation: MispricingObservation): string {
  return `${observation.strategyId}/${observation.seriesTicker}/${observation.marketTicker}`;
}

export function computeCoarseProbabilityOnlyBucketSummaries(
  observations: readonly MispricingObservation[],
): MispricingAtlasBucketSummary[] {
  const definitions = buildCoarseProbabilityBucketDefinitions();

  return definitions.map((definition) => {
    const inBucket = observations.filter((observation) =>
      probabilityFitsBucket(observation.predictedProbability, definition),
    );

    return computeMispricingBucketSummary(
      definition.bucketId,
      definition.bucketLabel,
      inBucket,
    );
  });
}

export function computeCoarseProbabilityTimeBucketSummaries(
  observations: readonly MispricingObservation[],
): MispricingAtlasBucketSummary[] {
  const probabilityDefinitions = buildCoarseProbabilityAxisDefinitions();
  const summaries: MispricingAtlasBucketSummary[] = [];

  for (const probabilityDefinition of probabilityDefinitions) {
    for (const timeDefinition of COARSE_TIME_REMAINING_AXIS_DEFINITIONS) {
      const inBucket = observations.filter((observation) => {
        if (observation.timeRemainingMs === null) {
          return false;
        }

        return (
          probabilityFitsBucket(observation.predictedProbability, probabilityDefinition)
          && valueFitsBucket(observation.timeRemainingMs, timeDefinition)
        );
      });

      summaries.push(
        computeMispricingBucketSummary(
          `${probabilityDefinition.bucketId}-${timeDefinition.bucketId}`,
          `${probabilityDefinition.bucketLabel} × ${timeDefinition.bucketLabel}`,
          inBucket,
        ),
      );
    }
  }

  return summaries;
}

export function computeCoarseProbabilityRegimeBucketSummaries(
  observations: readonly MispricingObservation[],
  regimeVolatilityByMarket: RegimeVolatilityByMarketKey,
): MispricingAtlasBucketSummary[] {
  const probabilityDefinitions = buildCoarseProbabilityAxisDefinitions();
  const summaries: MispricingAtlasBucketSummary[] = [];

  for (const probabilityDefinition of probabilityDefinitions) {
    for (const regimeDefinition of COARSE_VOLATILITY_REGIME_DEFINITIONS) {
      const inBucket = observations.filter((observation) => {
        const regimeTag = regimeVolatilityByMarket.get(marketJoinKey(observation));
        if (regimeTag !== regimeDefinition.regimeTag) {
          return false;
        }

        return probabilityFitsBucket(
          observation.predictedProbability,
          probabilityDefinition,
        );
      });

      summaries.push(
        computeMispricingBucketSummary(
          `${probabilityDefinition.bucketId}-${regimeDefinition.bucketId}`,
          `${probabilityDefinition.bucketLabel} × ${regimeDefinition.bucketLabel}`,
          inBucket,
        ),
      );
    }
  }

  return summaries;
}

export function computeCoarseProbabilityMoneynessBucketSummaries(
  observations: readonly MispricingObservation[],
): MispricingAtlasBucketSummary[] {
  const probabilityDefinitions = buildCoarseProbabilityAxisDefinitions();
  const summaries: MispricingAtlasBucketSummary[] = [];

  for (const probabilityDefinition of probabilityDefinitions) {
    for (const moneynessDefinition of MONEYNESS_BUCKET_DEFINITIONS) {
      const inBucket = observations.filter((observation) => {
        if (observation.moneynessPercent === null) {
          return false;
        }

        return (
          probabilityFitsBucket(observation.predictedProbability, probabilityDefinition)
          && valueFitsBucket(observation.moneynessPercent, moneynessDefinition)
        );
      });

      summaries.push(
        computeMispricingBucketSummary(
          `${probabilityDefinition.bucketId}-${moneynessDefinition.bucketId}`,
          `${probabilityDefinition.bucketLabel} × ${moneynessDefinition.bucketLabel}`,
          inBucket,
        ),
      );
    }
  }

  return summaries;
}

export function computeMoneynessTimeBucketSummaries(
  observations: readonly MispricingObservation[],
): MispricingAtlasBucketSummary[] {
  const summaries: MispricingAtlasBucketSummary[] = [];

  for (const moneynessDefinition of MONEYNESS_BUCKET_DEFINITIONS) {
    for (const timeDefinition of TIME_REMAINING_BUCKET_DEFINITIONS) {
      const inBucket = observations.filter((observation) => {
        if (
          observation.moneynessPercent === null
          || observation.timeRemainingMs === null
        ) {
          return false;
        }

        return (
          valueFitsBucket(observation.moneynessPercent, moneynessDefinition)
          && valueFitsBucket(observation.timeRemainingMs, timeDefinition)
        );
      });

      summaries.push(
        computeMispricingBucketSummary(
          `${moneynessDefinition.bucketId}-${timeDefinition.bucketId}`,
          `${moneynessDefinition.bucketLabel} × ${timeDefinition.bucketLabel}`,
          inBucket,
        ),
      );
    }
  }

  return summaries;
}

export function computeVolatilityMoneynessBucketSummaries(
  observations: readonly MispricingObservation[],
): MispricingAtlasBucketSummary[] {
  const summaries: MispricingAtlasBucketSummary[] = [];

  for (const volatilityDefinition of VOLATILITY_BUCKET_DEFINITIONS) {
    for (const moneynessDefinition of MONEYNESS_BUCKET_DEFINITIONS) {
      const inBucket = observations.filter((observation) => {
        if (
          observation.annualizedVolatility === null
          || observation.moneynessPercent === null
        ) {
          return false;
        }

        return (
          valueFitsBucket(observation.annualizedVolatility, volatilityDefinition)
          && valueFitsBucket(observation.moneynessPercent, moneynessDefinition)
        );
      });

      summaries.push(
        computeMispricingBucketSummary(
          `${volatilityDefinition.bucketId}-${moneynessDefinition.bucketId}`,
          `${volatilityDefinition.bucketLabel} × ${moneynessDefinition.bucketLabel}`,
          inBucket,
        ),
      );
    }
  }

  return summaries;
}

export function computeVolatilityProbabilityTimeBucketSummaries(
  observations: readonly MispricingObservation[],
): MispricingAtlasBucketSummary[] {
  const probabilityDefinitions = buildCoarseProbabilityAxisDefinitions();
  const summaries: MispricingAtlasBucketSummary[] = [];

  for (const volatilityDefinition of VOLATILITY_BUCKET_DEFINITIONS) {
    for (const probabilityDefinition of probabilityDefinitions) {
      for (const timeDefinition of COARSE_TIME_REMAINING_AXIS_DEFINITIONS) {
        const inBucket = observations.filter((observation) => {
          if (
            observation.annualizedVolatility === null
            || observation.timeRemainingMs === null
          ) {
            return false;
          }

          return (
            valueFitsBucket(observation.annualizedVolatility, volatilityDefinition)
            && probabilityFitsBucket(observation.predictedProbability, probabilityDefinition)
            && valueFitsBucket(observation.timeRemainingMs, timeDefinition)
          );
        });

        summaries.push(
          computeMispricingBucketSummary(
            `${volatilityDefinition.bucketId}-${probabilityDefinition.bucketId}-${timeDefinition.bucketId}`,
            `${volatilityDefinition.bucketLabel} × ${probabilityDefinition.bucketLabel} × ${timeDefinition.bucketLabel}`,
            inBucket,
          ),
        );
      }
    }
  }

  return summaries;
}

export function computeCoarseMispricingBucketSummaries(
  observations: readonly MispricingObservation[],
  regimeVolatilityByMarket?: RegimeVolatilityByMarketKey,
): MispricingAtlasCoarseBuckets {
  return {
    probabilityOnly: computeCoarseProbabilityOnlyBucketSummaries(observations),
    probabilityTime: computeCoarseProbabilityTimeBucketSummaries(observations),
    probabilityRegime: regimeVolatilityByMarket
      ? computeCoarseProbabilityRegimeBucketSummaries(
          observations,
          regimeVolatilityByMarket,
        )
      : [],
    probabilityMoneyness: computeCoarseProbabilityMoneynessBucketSummaries(observations),
    moneynessTime: computeMoneynessTimeBucketSummaries(observations),
    volatilityMoneyness: computeVolatilityMoneynessBucketSummaries(observations),
    volatilityProbabilityTime: computeVolatilityProbabilityTimeBucketSummaries(observations),
  };
}
