import type {
  EnrichedMispricingObservation,
  HypothesisLeaveOnePeriodOutMetrics,
  HypothesisRegimeStabilityMetrics,
  HypothesisSampleConcentrationMetrics,
  HypothesisTimeStabilityMetrics,
  HypothesisValidationConfig,
  LeaveOnePeriodOutFold,
  ParsedAtlasHypothesisRef,
  PeriodCalibrationMetric,
  RegimeCalibrationMetric,
  VolatilityRegimeTag,
} from "./hypothesisRobustnessTypes";

function roundMetric(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function average(values: readonly number[]): number | null {
  if (values.length === 0) {
    return null;
  }

  return values.reduce((total, value) => total + value, 0) / values.length;
}

export function computeSignedCalibrationError(
  observations: readonly Pick<
    EnrichedMispricingObservation,
    "predictedProbability" | "observedOutcome"
  >[],
): number | null {
  const predicted = average(observations.map((observation) => observation.predictedProbability));
  const realized = average(observations.map((observation) => observation.observedOutcome));

  if (predicted === null || realized === null) {
    return null;
  }

  return roundMetric(predicted - realized);
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

function groupByKey<T>(
  items: readonly T[],
  readKey: (item: T) => string | null,
): Map<string, T[]> {
  const groups = new Map<string, T[]>();

  for (const item of items) {
    const key = readKey(item);
    if (key === null) {
      continue;
    }

    const bucket = groups.get(key) ?? [];
    bucket.push(item);
    groups.set(key, bucket);
  }

  return groups;
}

function computePeriodMetrics(
  observations: readonly EnrichedMispricingObservation[],
  readPeriodKey: (observation: EnrichedMispricingObservation) => string | null,
  direction: ParsedAtlasHypothesisRef["direction"],
  config: HypothesisValidationConfig,
): PeriodCalibrationMetric[] {
  const groups = groupByKey(observations, readPeriodKey);

  return [...groups.entries()]
    .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
    .map(([periodKey, periodObservations]) => {
      const signedCalibrationError = computeSignedCalibrationError(periodObservations);
      const qualifying =
        periodObservations.length >= config.minPeriodObservations
        && edgeMatchesDirection(signedCalibrationError, direction, config.minCalibrationError);

      return {
        periodKey,
        observations: periodObservations.length,
        signedCalibrationError,
        edgeMatchesDirection: qualifying,
      };
    });
}

function computePersistenceRate(
  periods: readonly PeriodCalibrationMetric[],
  minPeriodObservations: number,
): number {
  const qualifying = periods.filter(
    (period) => period.observations >= minPeriodObservations,
  );

  if (qualifying.length === 0) {
    return 0;
  }

  const persistent = qualifying.filter((period) => period.edgeMatchesDirection).length;
  return roundMetric(persistent / qualifying.length);
}

export function computeTimeStabilityMetrics(
  observations: readonly EnrichedMispricingObservation[],
  direction: ParsedAtlasHypothesisRef["direction"],
  config: HypothesisValidationConfig,
): HypothesisTimeStabilityMetrics {
  const monthPeriods = computePeriodMetrics(
    observations,
    (observation) => observation.calendarMonth,
    direction,
    config,
  );
  const quarterPeriods = computePeriodMetrics(
    observations,
    (observation) => observation.calendarQuarter,
    direction,
    config,
  );

  const monthPersistenceRate = computePersistenceRate(
    monthPeriods,
    config.minPeriodObservations,
  );
  const quarterPersistenceRate = computePersistenceRate(
    quarterPeriods,
    config.minPeriodObservations,
  );
  const scoreComponent = roundMetric(
    25 * (monthPersistenceRate * 0.6 + quarterPersistenceRate * 0.4),
  );

  return {
    monthPeriods,
    quarterPeriods,
    monthPersistenceRate,
    quarterPersistenceRate,
    scoreComponent,
  };
}

export function computeRegimeStabilityMetrics(
  observations: readonly EnrichedMispricingObservation[],
  direction: ParsedAtlasHypothesisRef["direction"],
  config: HypothesisValidationConfig,
): HypothesisRegimeStabilityMetrics {
  const regimes: VolatilityRegimeTag[] = ["low", "medium", "high"];
  const metrics: RegimeCalibrationMetric[] = regimes.map((regime) => {
    const regimeObservations = observations.filter(
      (observation) => observation.volatilityRegime === regime,
    );
    const signedCalibrationError = computeSignedCalibrationError(regimeObservations);

    return {
      regime,
      observations: regimeObservations.length,
      signedCalibrationError,
      edgeMatchesDirection:
        regimeObservations.length >= config.minPeriodObservations
        && edgeMatchesDirection(signedCalibrationError, direction, config.minCalibrationError),
    };
  });

  const regimesWithData = metrics.filter(
    (metric) => metric.observations >= config.minPeriodObservations,
  ).length;
  const regimesWithEdge = metrics.filter((metric) => metric.edgeMatchesDirection).length;
  const coverageFactor = regimesWithData === 0 ? 0 : Math.min(regimesWithData / 3, 1);
  const edgeRate = regimesWithData === 0 ? 0 : regimesWithEdge / regimesWithData;
  const scoreComponent = roundMetric(25 * edgeRate * coverageFactor);

  return {
    regimes: metrics,
    regimesWithEdge,
    regimesWithData,
    scoreComponent,
  };
}

export function computeSampleConcentrationMetrics(
  observations: readonly EnrichedMispricingObservation[],
  config: HypothesisValidationConfig,
): HypothesisSampleConcentrationMetrics {
  const dayGroups = groupByKey(observations, (observation) => observation.tradingDayUtc);
  const uniqueTradingDays = dayGroups.size;

  let largestContributingDay: string | null = null;
  let largestDayObservations = 0;

  for (const [day, dayObservations] of dayGroups.entries()) {
    if (dayObservations.length > largestDayObservations) {
      largestContributingDay = day;
      largestDayObservations = dayObservations.length;
    }
  }

  const largestDayPercent =
    observations.length === 0
      ? 0
      : roundMetric((largestDayObservations / observations.length) * 100);
  const singleDayDominated = largestDayPercent / 100 >= config.singleDayConcentrationFlag;

  const diversityBase =
    uniqueTradingDays >= 5 ? 1 - largestDayObservations / Math.max(observations.length, 1) : uniqueTradingDays / 5;
  const scoreComponent = roundMetric(
    25 * Math.max(0, Math.min(1, diversityBase)) * (singleDayDominated ? 0.5 : 1),
  );

  return {
    uniqueTradingDays,
    largestContributingDay,
    largestDayObservations,
    largestDayPercent,
    singleDayDominated,
    scoreComponent,
  };
}

/** Leave-one-month-out calibration variance (direction/config reserved for API parity). */
export function computeLeaveOnePeriodOutMetrics(
  observations: readonly EnrichedMispricingObservation[],
  direction: ParsedAtlasHypothesisRef["direction"],
  config: HypothesisValidationConfig,
): HypothesisLeaveOnePeriodOutMetrics {
  void direction;
  void config;
  const monthGroups = groupByKey(observations, (observation) => observation.calendarMonth);
  const folds: LeaveOnePeriodOutFold[] = [];

  for (const excludedMonth of [...monthGroups.keys()].sort()) {
    const remaining = observations.filter(
      (observation) => observation.calendarMonth !== excludedMonth,
    );
    folds.push({
      excludedMonth,
      remainingObservations: remaining.length,
      signedCalibrationError: computeSignedCalibrationError(remaining),
    });
  }

  const errors = folds
    .map((fold) => fold.signedCalibrationError)
    .filter((value): value is number => value !== null);

  const meanError = average(errors) ?? 0;
  const errorVariance =
    errors.length <= 1
      ? 0
      : errors.reduce((total, value) => total + (value - meanError) ** 2, 0) / errors.length;
  const errorStdDev = roundMetric(Math.sqrt(errorVariance));
  const normalizedVariance = Math.min(errorVariance / 0.01, 1);
  const scoreComponent = roundMetric(25 * (1 - normalizedVariance));

  return {
    folds,
    errorVariance: roundMetric(errorVariance),
    errorStdDev,
    scoreComponent,
  };
}

export function computeRobustnessScore(components: {
  timeStability: HypothesisTimeStabilityMetrics;
  regimeStability: HypothesisRegimeStabilityMetrics;
  sampleConcentration: HypothesisSampleConcentrationMetrics;
  leaveOnePeriodOut: HypothesisLeaveOnePeriodOutMetrics;
}): number {
  return Math.round(
    components.timeStability.scoreComponent
    + components.regimeStability.scoreComponent
    + components.sampleConcentration.scoreComponent
    + components.leaveOnePeriodOut.scoreComponent,
  );
}

export function buildValidationReasons(input: {
  robustnessScore: number;
  config: HypothesisValidationConfig;
  observationCount: number;
  timeStability: HypothesisTimeStabilityMetrics;
  regimeStability: HypothesisRegimeStabilityMetrics;
  sampleConcentration: HypothesisSampleConcentrationMetrics;
  leaveOnePeriodOut: HypothesisLeaveOnePeriodOutMetrics;
  unsupported: boolean;
}): string[] {
  const reasons: string[] = [];

  if (input.unsupported) {
    reasons.push("Hypothesis type is not atlas-calibration based; robustness metrics are limited.");
    return reasons;
  }

  if (input.observationCount === 0) {
    reasons.push("No qualifying observations found for this hypothesis bucket.");
    return reasons;
  }

  if (input.timeStability.monthPersistenceRate >= 0.67) {
    reasons.push(
      `Calibration edge persisted across ${(input.timeStability.monthPersistenceRate * 100).toFixed(0)}% of qualifying months.`,
    );
  } else {
    reasons.push(
      `Month-level edge persistence is weak (${(input.timeStability.monthPersistenceRate * 100).toFixed(0)}%).`,
    );
  }

  if (input.regimeStability.regimesWithEdge >= 2) {
    reasons.push(
      `Edge appears in ${input.regimeStability.regimesWithEdge} volatility regimes.`,
    );
  } else if (input.regimeStability.regimesWithData === 0) {
    reasons.push("Regime tags unavailable; regime stability could not be measured.");
  } else {
    reasons.push("Edge is concentrated in a single volatility regime.");
  }

  if (input.sampleConcentration.singleDayDominated) {
    reasons.push(
      `Sample concentration risk: ${input.sampleConcentration.largestDayPercent.toFixed(1)}% of observations come from ${input.sampleConcentration.largestContributingDay}.`,
    );
  } else {
    reasons.push(
      `Sample spread across ${input.sampleConcentration.uniqueTradingDays} trading days (largest day ${input.sampleConcentration.largestDayPercent.toFixed(1)}%).`,
    );
  }

  if (input.leaveOnePeriodOut.errorStdDev <= 0.03) {
    reasons.push(
      `Leave-one-month-out calibration error std dev is ${input.leaveOnePeriodOut.errorStdDev.toFixed(3)} (stable).`,
    );
  } else {
    reasons.push(
      `Leave-one-month-out calibration error std dev is ${input.leaveOnePeriodOut.errorStdDev.toFixed(3)} (high variance).`,
    );
  }

  if (input.robustnessScore >= input.config.passScoreThreshold) {
    reasons.push(`Robustness score ${input.robustnessScore} meets promotion threshold.`);
  } else {
    reasons.push(
      `Robustness score ${input.robustnessScore} is below promotion threshold (${input.config.passScoreThreshold}).`,
    );
  }

  return reasons;
}
