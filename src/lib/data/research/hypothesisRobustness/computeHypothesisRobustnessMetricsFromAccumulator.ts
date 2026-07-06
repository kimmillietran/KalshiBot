import {
  buildValidationReasons,
  computeRobustnessScore,
} from "./computeHypothesisRobustnessMetrics";
import type {
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
import type { ValidationBucketAccumulator, ValidationGroupAggregate } from "./validationBucketAccumulator";

function roundMetric(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function average(values: readonly number[]): number | null {
  if (values.length === 0) {
    return null;
  }

  return values.reduce((total, value) => total + value, 0) / values.length;
}

function signedErrorFromAggregate(aggregate: ValidationGroupAggregate): number | null {
  if (aggregate.count === 0) {
    return null;
  }

  return roundMetric(
    aggregate.sumPredicted / aggregate.count - aggregate.sumOutcome / aggregate.count,
  );
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

function computePeriodMetricsFromAccumulator(
  groups: ReadonlyMap<string, ValidationGroupAggregate>,
  direction: ParsedAtlasHypothesisRef["direction"],
  config: HypothesisValidationConfig,
): PeriodCalibrationMetric[] {
  return [...groups.entries()]
    .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
    .map(([periodKey, aggregate]) => {
      const signedCalibrationError = signedErrorFromAggregate(aggregate);
      const qualifying =
        aggregate.count >= config.minPeriodObservations
        && edgeMatchesDirection(signedCalibrationError, direction, config.minCalibrationError);

      return {
        periodKey,
        observations: aggregate.count,
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

export function computeTimeStabilityMetricsFromAccumulator(
  accumulator: ValidationBucketAccumulator,
  direction: ParsedAtlasHypothesisRef["direction"],
  config: HypothesisValidationConfig,
): HypothesisTimeStabilityMetrics {
  const monthPeriods = computePeriodMetricsFromAccumulator(
    accumulator.byMonth,
    direction,
    config,
  );
  const quarterPeriods = computePeriodMetricsFromAccumulator(
    accumulator.byQuarter,
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

export function computeRegimeStabilityMetricsFromAccumulator(
  accumulator: ValidationBucketAccumulator,
  direction: ParsedAtlasHypothesisRef["direction"],
  config: HypothesisValidationConfig,
): HypothesisRegimeStabilityMetrics {
  const regimes: VolatilityRegimeTag[] = ["low", "medium", "high"];
  const metrics: RegimeCalibrationMetric[] = regimes.map((regime) => {
    const regimeAggregate = accumulator.byRegime.get(regime) ?? {
      count: 0,
      sumPredicted: 0,
      sumOutcome: 0,
    };
    const signedCalibrationError = signedErrorFromAggregate(regimeAggregate);

    return {
      regime,
      observations: regimeAggregate.count,
      signedCalibrationError,
      edgeMatchesDirection:
        regimeAggregate.count >= config.minPeriodObservations
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

export function computeSampleConcentrationMetricsFromAccumulator(
  accumulator: ValidationBucketAccumulator,
  config: HypothesisValidationConfig,
): HypothesisSampleConcentrationMetrics {
  const uniqueTradingDays = accumulator.byTradingDay.size;
  const observationCount = accumulator.total.count;

  let largestContributingDay: string | null = null;
  let largestDayObservations = 0;

  for (const [day, dayCount] of accumulator.byTradingDay.entries()) {
    if (dayCount > largestDayObservations) {
      largestContributingDay = day;
      largestDayObservations = dayCount;
    }
  }

  const largestDayPercent =
    observationCount === 0
      ? 0
      : roundMetric((largestDayObservations / observationCount) * 100);
  const singleDayDominated = largestDayPercent / 100 >= config.singleDayConcentrationFlag;

  const diversityBase =
    uniqueTradingDays >= 5
      ? 1 - largestDayObservations / Math.max(observationCount, 1)
      : uniqueTradingDays / 5;
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

export function computeLeaveOnePeriodOutMetricsFromAccumulator(
  accumulator: ValidationBucketAccumulator,
  direction: ParsedAtlasHypothesisRef["direction"],
  config: HypothesisValidationConfig,
): HypothesisLeaveOnePeriodOutMetrics {
  void direction;
  void config;

  const folds: LeaveOnePeriodOutFold[] = [];

  for (const excludedMonth of [...accumulator.byMonth.keys()].sort()) {
    const monthAggregate = accumulator.byMonth.get(excludedMonth);
    if (!monthAggregate) {
      continue;
    }

    const remainingCount = accumulator.total.count - monthAggregate.count;
    const remainingSumPredicted =
      accumulator.total.sumPredicted - monthAggregate.sumPredicted;
    const remainingSumOutcome = accumulator.total.sumOutcome - monthAggregate.sumOutcome;
    const signedCalibrationError =
      remainingCount === 0
        ? null
        : roundMetric(
            remainingSumPredicted / remainingCount - remainingSumOutcome / remainingCount,
          );

    folds.push({
      excludedMonth,
      remainingObservations: remainingCount,
      signedCalibrationError,
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

export function validateCandidateFromAccumulator(input: {
  candidate: {
    candidateId: string;
    hypothesis: string;
    sourceArtifact: string;
  };
  atlasRef: ParsedAtlasHypothesisRef | null;
  accumulator: ValidationBucketAccumulator | undefined;
  config: HypothesisValidationConfig;
}): {
  robustnessScore: number;
  passes: boolean;
  reasons: readonly string[];
  observationCount: number;
  timeStability: HypothesisTimeStabilityMetrics;
  regimeStability: HypothesisRegimeStabilityMetrics;
  sampleConcentration: HypothesisSampleConcentrationMetrics;
  leaveOnePeriodOut: HypothesisLeaveOnePeriodOutMetrics;
  unsupported: boolean;
} {
  const emptyPeriods = {
    monthPeriods: [],
    quarterPeriods: [],
    monthPersistenceRate: 0,
    quarterPersistenceRate: 0,
    scoreComponent: 0,
  };
  const emptyComponents = {
    timeStability: emptyPeriods,
    regimeStability: {
      regimes: [],
      regimesWithEdge: 0,
      regimesWithData: 0,
      scoreComponent: 0,
    },
    sampleConcentration: {
      uniqueTradingDays: 0,
      largestContributingDay: null,
      largestDayObservations: 0,
      largestDayPercent: 0,
      singleDayDominated: false,
      scoreComponent: 0,
    },
    leaveOnePeriodOut: {
      folds: [],
      errorVariance: 0,
      errorStdDev: 0,
      scoreComponent: 0,
    },
  };

  if (!input.atlasRef) {
    const reasons = buildValidationReasons({
      robustnessScore: 0,
      config: input.config,
      observationCount: 0,
      ...emptyComponents,
      unsupported: true,
    });

    return {
      robustnessScore: 0,
      passes: false,
      reasons,
      observationCount: 0,
      ...emptyComponents,
      unsupported: true,
    };
  }

  if (!input.accumulator || input.accumulator.total.count === 0) {
    const reasons = buildValidationReasons({
      robustnessScore: 0,
      config: input.config,
      observationCount: 0,
      ...emptyComponents,
      unsupported: false,
    });

    return {
      robustnessScore: 0,
      passes: false,
      reasons,
      observationCount: 0,
      ...emptyComponents,
      unsupported: false,
    };
  }

  const timeStability = computeTimeStabilityMetricsFromAccumulator(
    input.accumulator,
    input.atlasRef.direction,
    input.config,
  );
  const regimeStability = computeRegimeStabilityMetricsFromAccumulator(
    input.accumulator,
    input.atlasRef.direction,
    input.config,
  );
  const sampleConcentration = computeSampleConcentrationMetricsFromAccumulator(
    input.accumulator,
    input.config,
  );
  const leaveOnePeriodOut = computeLeaveOnePeriodOutMetricsFromAccumulator(
    input.accumulator,
    input.atlasRef.direction,
    input.config,
  );
  const robustnessScore = computeRobustnessScore({
    timeStability,
    regimeStability,
    sampleConcentration,
    leaveOnePeriodOut,
  });
  const observationCount = input.accumulator.total.count;
  const reasons = buildValidationReasons({
    robustnessScore,
    config: input.config,
    observationCount,
    timeStability,
    regimeStability,
    sampleConcentration,
    leaveOnePeriodOut,
    unsupported: false,
  });
  const passes =
    robustnessScore >= input.config.passScoreThreshold
    && !sampleConcentration.singleDayDominated
    && observationCount >= input.config.minPeriodObservations * 2;

  return {
    robustnessScore,
    passes,
    reasons,
    observationCount,
    timeStability,
    regimeStability,
    sampleConcentration,
    leaveOnePeriodOut,
    unsupported: false,
  };
}
