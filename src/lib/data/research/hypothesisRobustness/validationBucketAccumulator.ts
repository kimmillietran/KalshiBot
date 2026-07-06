import type {
  ParsedAtlasHypothesisRef,
  VolatilityRegimeTag,
} from "./hypothesisRobustnessTypes";

export type ValidationGroupAggregate = {
  count: number;
  sumPredicted: number;
  sumOutcome: number;
};

export type ValidationBucketAccumulator = {
  groupId: ParsedAtlasHypothesisRef["groupId"];
  bucketId: string;
  total: ValidationGroupAggregate;
  byMonth: Map<string, ValidationGroupAggregate>;
  byQuarter: Map<string, ValidationGroupAggregate>;
  byRegime: Map<VolatilityRegimeTag, ValidationGroupAggregate>;
  byTradingDay: Map<string, number>;
};

export function createEmptyGroupAggregate(): ValidationGroupAggregate {
  return { count: 0, sumPredicted: 0, sumOutcome: 0 };
}

export function addToGroupAggregate(
  aggregate: ValidationGroupAggregate,
  predictedProbability: number,
  observedOutcome: 0 | 1,
): void {
  aggregate.count += 1;
  aggregate.sumPredicted += predictedProbability;
  aggregate.sumOutcome += observedOutcome;
}

export function bucketAccumulatorKey(reference: {
  groupId: string;
  bucketId: string;
}): string {
  return `${reference.groupId}::${reference.bucketId}`;
}

export function createValidationBucketAccumulator(
  reference: Pick<ParsedAtlasHypothesisRef, "groupId" | "bucketId">,
): ValidationBucketAccumulator {
  return {
    groupId: reference.groupId,
    bucketId: reference.bucketId,
    total: createEmptyGroupAggregate(),
    byMonth: new Map(),
    byQuarter: new Map(),
    byRegime: new Map(),
    byTradingDay: new Map(),
  };
}

function getOrCreateGroupAggregate(
  groups: Map<string, ValidationGroupAggregate>,
  key: string,
): ValidationGroupAggregate {
  const existing = groups.get(key);
  if (existing) {
    return existing;
  }

  const created = createEmptyGroupAggregate();
  groups.set(key, created);
  return created;
}

function getOrCreateRegimeAggregate(
  groups: Map<VolatilityRegimeTag, ValidationGroupAggregate>,
  regime: VolatilityRegimeTag,
): ValidationGroupAggregate {
  const existing = groups.get(regime);
  if (existing) {
    return existing;
  }

  const created = createEmptyGroupAggregate();
  groups.set(regime, created);
  return created;
}

/** Records one qualifying observation into bucket validation aggregates. */
export function recordValidationObservation(
  accumulator: ValidationBucketAccumulator,
  observation: {
    predictedProbability: number;
    observedOutcome: 0 | 1;
    calendarMonth: string | null;
    calendarQuarter: string | null;
    tradingDayUtc: string | null;
    volatilityRegime: VolatilityRegimeTag | null;
  },
): void {
  addToGroupAggregate(
    accumulator.total,
    observation.predictedProbability,
    observation.observedOutcome,
  );

  if (observation.calendarMonth) {
    addToGroupAggregate(
      getOrCreateGroupAggregate(accumulator.byMonth, observation.calendarMonth),
      observation.predictedProbability,
      observation.observedOutcome,
    );
  }

  if (observation.calendarQuarter) {
    addToGroupAggregate(
      getOrCreateGroupAggregate(accumulator.byQuarter, observation.calendarQuarter),
      observation.predictedProbability,
      observation.observedOutcome,
    );
  }

  if (observation.volatilityRegime) {
    addToGroupAggregate(
      getOrCreateRegimeAggregate(accumulator.byRegime, observation.volatilityRegime),
      observation.predictedProbability,
      observation.observedOutcome,
    );
  }

  if (observation.tradingDayUtc) {
    accumulator.byTradingDay.set(
      observation.tradingDayUtc,
      (accumulator.byTradingDay.get(observation.tradingDayUtc) ?? 0) + 1,
    );
  }
}
