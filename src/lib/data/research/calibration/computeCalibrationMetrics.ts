import {
  DEFAULT_CALIBRATION_BIN_COUNT,
  type CalibrationBin,
  type CalibrationChannelMetrics,
  type CalibrationObservation,
  type CalibrationProbabilitySource,
  type CalibrationReliabilityRow,
} from "./calibrationTypes";

const LOG_LOSS_EPSILON = 1e-15;

function clampProbability(probability: number): number {
  return Math.min(1 - LOG_LOSS_EPSILON, Math.max(LOG_LOSS_EPSILON, probability));
}

function roundMetric(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function average(values: readonly number[]): number | null {
  if (values.length === 0) {
    return null;
  }

  return values.reduce((total, value) => total + value, 0) / values.length;
}

export function computeBrierScore(
  observations: readonly Pick<CalibrationObservation, "predictedProbability" | "observedOutcome">[],
): number | null {
  if (observations.length === 0) {
    return null;
  }

  const total = observations.reduce((sum, observation) => {
    const error =
      observation.predictedProbability - observation.observedOutcome;
    return sum + error * error;
  }, 0);

  return roundMetric(total / observations.length);
}

export function computeLogLoss(
  observations: readonly Pick<CalibrationObservation, "predictedProbability" | "observedOutcome">[],
): number | null {
  if (observations.length === 0) {
    return null;
  }

  const total = observations.reduce((sum, observation) => {
    const probability = clampProbability(observation.predictedProbability);
    const outcome = observation.observedOutcome;
    return (
      sum
      - (outcome * Math.log(probability) + (1 - outcome) * Math.log(1 - probability))
    );
  }, 0);

  return roundMetric(total / observations.length);
}

export function buildCalibrationBins(
  observations: readonly Pick<CalibrationObservation, "predictedProbability" | "observedOutcome">[],
  binCount: number = DEFAULT_CALIBRATION_BIN_COUNT,
): CalibrationBin[] {
  const bins: CalibrationBin[] = [];

  for (let binIndex = 0; binIndex < binCount; binIndex += 1) {
    const binStart = binIndex / binCount;
    const binEnd = (binIndex + 1) / binCount;
    const inBin = observations.filter((observation) => {
      const probability = observation.predictedProbability;
      if (binIndex === binCount - 1) {
        return probability >= binStart && probability <= binEnd;
      }

      return probability >= binStart && probability < binEnd;
    });

    const predictedValues = inBin.map((observation) => observation.predictedProbability);
    const observedValues = inBin.map((observation) => observation.observedOutcome);
    const predictedAverage = average(predictedValues);
    const observedAverage = average(observedValues);

    bins.push({
      binIndex,
      binStart: roundMetric(binStart),
      binEnd: roundMetric(binEnd),
      sampleCount: inBin.length,
      averagePredictedProbability:
        predictedAverage === null ? null : roundMetric(predictedAverage),
      observedSettlementFrequency:
        observedAverage === null ? null : roundMetric(observedAverage),
    });
  }

  return bins;
}

export function computeExpectedCalibrationError(
  bins: readonly CalibrationBin[],
  totalSampleCount: number,
): number | null {
  if (totalSampleCount === 0) {
    return null;
  }

  const weighted = bins.reduce((sum, bin) => {
    if (
      bin.sampleCount === 0
      || bin.averagePredictedProbability === null
      || bin.observedSettlementFrequency === null
    ) {
      return sum;
    }

    const gap = Math.abs(
      bin.averagePredictedProbability - bin.observedSettlementFrequency,
    );
    return sum + gap * (bin.sampleCount / totalSampleCount);
  }, 0);

  return roundMetric(weighted);
}

export function buildReliabilityTable(
  bins: readonly CalibrationBin[],
): CalibrationReliabilityRow[] {
  return bins.map((bin) => {
    const calibrationGap =
      bin.averagePredictedProbability !== null
      && bin.observedSettlementFrequency !== null
        ? roundMetric(
            bin.averagePredictedProbability - bin.observedSettlementFrequency,
          )
        : null;

    return {
      binIndex: bin.binIndex,
      binLabel: `[${bin.binStart.toFixed(1)}, ${bin.binEnd.toFixed(1)}${
        bin.binIndex === bins.length - 1 ? "]" : ")"
      }`,
      sampleCount: bin.sampleCount,
      averagePredictedProbability: bin.averagePredictedProbability,
      observedSettlementFrequency: bin.observedSettlementFrequency,
      calibrationGap,
    };
  });
}

export function computeCalibrationChannelMetrics(
  observations: readonly CalibrationObservation[],
  source: CalibrationProbabilitySource,
  binCount: number = DEFAULT_CALIBRATION_BIN_COUNT,
): CalibrationChannelMetrics {
  const sourceObservations = observations.filter(
    (observation) => observation.source === source,
  );
  const bins = buildCalibrationBins(sourceObservations, binCount);

  return {
    source,
    sampleCount: sourceObservations.length,
    brierScore: computeBrierScore(sourceObservations),
    logLoss: computeLogLoss(sourceObservations),
    calibrationError: computeExpectedCalibrationError(
      bins,
      sourceObservations.length,
    ),
    bins,
    reliabilityTable: buildReliabilityTable(bins),
  };
}
