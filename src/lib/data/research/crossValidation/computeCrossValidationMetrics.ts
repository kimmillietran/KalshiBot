import { deterministicUniformIndex } from "@/lib/data/research/statisticalSignificance/deterministicSampling";
import {
  computeLeaveOnePeriodOutMetrics,
  computeSignedCalibrationError,
} from "@/lib/data/research/hypothesisRobustness/computeHypothesisRobustnessMetrics";
import type {
  EnrichedMispricingObservation,
  ParsedAtlasHypothesisRef,
} from "@/lib/data/research/hypothesisRobustness/hypothesisRobustnessTypes";

import type {
  CrossValidationConfig,
  CrossValidationFold,
  CrossValidationMethodId,
  CrossValidationMethodResult,
  CrossValidationStabilityMetrics,
} from "./crossValidationTypes";

type ObservationSlice = readonly EnrichedMispricingObservation[];

function roundMetric(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function average(values: readonly number[]): number | null {
  if (values.length === 0) {
    return null;
  }

  return values.reduce((total, value) => total + value, 0) / values.length;
}

function edgeMatchesDirection(
  signedCalibrationError: number | null,
  direction: ParsedAtlasHypothesisRef["direction"],
  minCalibrationError: number,
): boolean {
  if (signedCalibrationError === null) {
    return false;
  }

  if (direction === "over") {
    return signedCalibrationError >= minCalibrationError;
  }

  return signedCalibrationError <= -minCalibrationError;
}

function evaluateFold(
  observations: ObservationSlice,
  direction: ParsedAtlasHypothesisRef["direction"],
  config: CrossValidationConfig,
): Pick<CrossValidationFold, "calibrationError" | "observationCount" | "passes"> {
  const calibrationError = computeSignedCalibrationError(observations);
  const observationCount = observations.length;
  const passes =
    observationCount >= config.minPeriodObservations
    && edgeMatchesDirection(calibrationError, direction, config.minCalibrationError);

  return {
    calibrationError,
    observationCount,
    passes,
  };
}

function computeStabilityMetrics(
  folds: readonly CrossValidationFold[],
): CrossValidationStabilityMetrics {
  const errors = folds
    .map((fold) => fold.calibrationError)
    .filter((value): value is number => value !== null);
  const meanError = average(errors) ?? 0;
  const errorVariance =
    errors.length <= 1
      ? 0
      : errors.reduce((total, value) => total + (value - meanError) ** 2, 0) / errors.length;
  const errorStdDev = roundMetric(Math.sqrt(errorVariance));
  const qualifyingFolds = folds.filter(
    (fold) => fold.observationCount >= 1,
  );
  const qualifyingFoldCount = folds.filter((fold) => fold.passes).length;
  const totalFoldCount = folds.length;
  const persistenceRate =
    qualifyingFolds.length === 0
      ? 0
      : roundMetric(qualifyingFoldCount / qualifyingFolds.length);
  const coefficientOfVariation =
    meanError === 0 || errors.length === 0
      ? null
      : roundMetric(Math.abs(errorStdDev / meanError));

  return {
    errorStdDev,
    errorVariance: roundMetric(errorVariance),
    persistenceRate,
    coefficientOfVariation,
    qualifyingFoldCount,
    totalFoldCount,
  };
}

function aggregateMethodResult(
  method: CrossValidationMethodId,
  folds: readonly CrossValidationFold[],
  totalObservationCount: number,
  config: CrossValidationConfig,
): CrossValidationMethodResult {
  const stabilityMetrics = computeStabilityMetrics(folds);
  const errors = folds
    .map((fold) => fold.calibrationError)
    .filter((value): value is number => value !== null);

  const passes =
    totalObservationCount >= config.minPeriodObservations * 2
    && stabilityMetrics.totalFoldCount > 0
    && stabilityMetrics.persistenceRate >= config.minPersistenceRate
    && stabilityMetrics.errorStdDev <= config.maxErrorStdDev;

  return {
    method,
    folds,
    calibrationError: average(errors),
    variance: stabilityMetrics.errorVariance,
    observationCount: totalObservationCount,
    passes,
    stabilityMetrics,
  };
}

function groupObservationsByMonth(
  observations: ObservationSlice,
): Map<string, EnrichedMispricingObservation[]> {
  const groups = new Map<string, EnrichedMispricingObservation[]>();

  for (const observation of observations) {
    const month = observation.calendarMonth;
    if (month === null) {
      continue;
    }

    const bucket = groups.get(month) ?? [];
    bucket.push(observation);
    groups.set(month, bucket);
  }

  return groups;
}

function sortedMonthKeys(groups: Map<string, EnrichedMispricingObservation[]>): string[] {
  return [...groups.keys()].sort((left, right) => left.localeCompare(right));
}

export function computeRollingWindowCrossValidation(
  observations: ObservationSlice,
  direction: ParsedAtlasHypothesisRef["direction"],
  config: CrossValidationConfig,
): CrossValidationMethodResult {
  const monthGroups = groupObservationsByMonth(observations);
  const months = sortedMonthKeys(monthGroups);
  const windowSize = Math.max(1, config.rollingWindowMonths);
  const folds: CrossValidationFold[] = [];

  if (months.length >= windowSize) {
    for (let startIndex = 0; startIndex <= months.length - windowSize; startIndex += 1) {
      const windowMonths = months.slice(startIndex, startIndex + windowSize);
      const windowObservations = observations.filter(
        (observation) =>
          observation.calendarMonth !== null
          && windowMonths.includes(observation.calendarMonth),
      );
      const foldKey = `${windowMonths[0]}..${windowMonths[windowMonths.length - 1]}`;

      folds.push({
        foldKey,
        ...evaluateFold(windowObservations, direction, config),
      });
    }
  }

  return aggregateMethodResult(
    "rollingWindow",
    folds,
    observations.length,
    config,
  );
}

export function computeExpandingWindowCrossValidation(
  observations: ObservationSlice,
  direction: ParsedAtlasHypothesisRef["direction"],
  config: CrossValidationConfig,
): CrossValidationMethodResult {
  const monthGroups = groupObservationsByMonth(observations);
  const months = sortedMonthKeys(monthGroups);
  const folds: CrossValidationFold[] = [];

  for (let endIndex = 0; endIndex < months.length; endIndex += 1) {
    const includedMonths = months.slice(0, endIndex + 1);
    const windowObservations = observations.filter(
      (observation) =>
        observation.calendarMonth !== null
        && includedMonths.includes(observation.calendarMonth),
    );

    folds.push({
      foldKey: `${includedMonths[0]}..${includedMonths[includedMonths.length - 1]}`,
      ...evaluateFold(windowObservations, direction, config),
    });
  }

  return aggregateMethodResult(
    "expandingWindow",
    folds,
    observations.length,
    config,
  );
}

export function computeLeaveOneMonthOutCrossValidation(
  observations: ObservationSlice,
  direction: ParsedAtlasHypothesisRef["direction"],
  config: CrossValidationConfig,
): CrossValidationMethodResult {
  const lopo = computeLeaveOnePeriodOutMetrics(observations, direction, {
    passScoreThreshold: 70,
    minCalibrationError: config.minCalibrationError,
    singleDayConcentrationFlag: 0.5,
    minPeriodObservations: config.minPeriodObservations,
  });

  const folds: CrossValidationFold[] = lopo.folds.map((fold) => {
    const remaining = observations.filter(
      (observation) => observation.calendarMonth !== fold.excludedMonth,
    );
    const evaluation = evaluateFold(remaining, direction, config);

    return {
      foldKey: fold.excludedMonth,
      calibrationError: fold.signedCalibrationError,
      observationCount: fold.remainingObservations,
      passes: evaluation.passes,
    };
  });

  return aggregateMethodResult(
    "leaveOneMonthOut",
    folds,
    observations.length,
    config,
  );
}

export function computeLeaveOneRegimeOutCrossValidation(
  observations: ObservationSlice,
  direction: ParsedAtlasHypothesisRef["direction"],
  config: CrossValidationConfig,
): CrossValidationMethodResult {
  const regimes = ["low", "medium", "high"] as const;
  const folds: CrossValidationFold[] = regimes.map((regime) => {
    const remaining = observations.filter(
      (observation) => observation.volatilityRegime !== regime,
    );

    return {
      foldKey: regime,
      ...evaluateFold(remaining, direction, config),
    };
  });

  return aggregateMethodResult(
    "leaveOneRegimeOut",
    folds,
    observations.length,
    config,
  );
}

export function computeRandomBootstrapCrossValidation(
  observations: ObservationSlice,
  direction: ParsedAtlasHypothesisRef["direction"],
  config: CrossValidationConfig,
): CrossValidationMethodResult {
  const folds: CrossValidationFold[] = [];
  const sampleSize = observations.length;

  for (
    let iterationIndex = 0;
    iterationIndex < config.bootstrapIterations;
    iterationIndex += 1
  ) {
    if (sampleSize === 0) {
      folds.push({
        foldKey: `bootstrap-${String(iterationIndex + 1).padStart(4, "0")}`,
        calibrationError: null,
        observationCount: 0,
        passes: false,
      });
      continue;
    }

    const resampled: EnrichedMispricingObservation[] = [];
    for (let drawIndex = 0; drawIndex < sampleSize; drawIndex += 1) {
      const index = deterministicUniformIndex({
        seed: config.bootstrapSeed,
        simulationIndex: iterationIndex,
        drawIndex,
        upperBound: sampleSize,
      });
      resampled.push(observations[index]!);
    }

    folds.push({
      foldKey: `bootstrap-${String(iterationIndex + 1).padStart(4, "0")}`,
      ...evaluateFold(resampled, direction, config),
    });
  }

  return aggregateMethodResult(
    "randomBootstrap",
    folds,
    observations.length,
    config,
  );
}

export function computeAllCrossValidationMethods(
  observations: ObservationSlice,
  direction: ParsedAtlasHypothesisRef["direction"],
  config: CrossValidationConfig,
): Record<CrossValidationMethodId, CrossValidationMethodResult> {
  return {
    rollingWindow: computeRollingWindowCrossValidation(observations, direction, config),
    expandingWindow: computeExpandingWindowCrossValidation(observations, direction, config),
    leaveOneMonthOut: computeLeaveOneMonthOutCrossValidation(observations, direction, config),
    leaveOneRegimeOut: computeLeaveOneRegimeOutCrossValidation(observations, direction, config),
    randomBootstrap: computeRandomBootstrapCrossValidation(observations, direction, config),
  };
}
