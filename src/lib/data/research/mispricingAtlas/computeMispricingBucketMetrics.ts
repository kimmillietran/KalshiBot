import {
  buildCalibrationBins,
  computeBrierScore,
} from "@/lib/data/research/calibration/computeCalibrationMetrics";

import {
  buildProbabilityBucketDefinitions,
  MONEYNESS_BUCKET_DEFINITIONS,
  probabilityFitsBucket,
  TIME_REMAINING_BUCKET_DEFINITIONS,
  valueFitsBucket,
  VOLATILITY_BUCKET_DEFINITIONS,
} from "./mispricingAtlasBuckets";
import type {
  MispricingAtlasBucketSummary,
  MispricingObservation,
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

function computeCalibrationGap(
  averageImpliedProbability: number | null,
  realizedFrequency: number | null,
): number | null {
  if (averageImpliedProbability === null || realizedFrequency === null) {
    return null;
  }

  return roundMetric(Math.abs(averageImpliedProbability - realizedFrequency));
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
    averageImpliedProbability:
      averageImpliedProbability === null
        ? null
        : roundMetric(averageImpliedProbability),
    realizedFrequency:
      realizedFrequency === null ? null : roundMetric(realizedFrequency),
    calibrationError: computeCalibrationGap(
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
