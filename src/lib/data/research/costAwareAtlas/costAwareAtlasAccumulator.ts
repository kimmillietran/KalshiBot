import {
  createAccumulatorsForAxisGroup,
  ingestObservationForAxisGroup,
  listRegistryAxisGroupsForAtlas,
} from "@/lib/data/research/dimensions/registryAtlasIntegration";
import { RESEARCH_AXIS_GROUPS } from "@/lib/data/research/dimensions";
import type { MispricingObservation } from "@/lib/data/research/mispricingAtlas/mispricingAtlasTypes";
import { collectMispricingAtlasBucketGroups } from "@/lib/data/research/mispricingAtlas/computeMispricingAtlasCoverage";

import { COST_AWARE_SPREAD_COHORT_ORDER } from "./costAwareAtlasConfig";
import {
  addObservationToCostAwareBucketState,
  classifyTradeability,
  compareBucketEntriesDeterministically,
  computeBucketCostMetrics,
  createCostAwareBucketAccumulatorState,
  observationMatchesSpreadCohort,
  type CostAwareBucketAccumulatorState,
} from "./costAwareAtlasMath";
import type {
  CostAwareAtlasConfig,
  CostAwareBucketEntry,
  CostAwareCohortMetrics,
  CostAwareMispricingObservation,
  MispricingAtlasBucketReference,
  SettlementSourceStatus,
  SpreadCohortId,
} from "./costAwareAtlasTypes";
import { toMispricingObservation } from "./parseCostAwareObservations";

type AxisBucketCostState = {
  bucketId: string;
  bucketLabel: string;
  cohorts: Map<SpreadCohortId, CostAwareBucketAccumulatorState>;
  derivedObservations: number;
  officialObservations: number;
  unknownSettlementObservations: number;
};

type AxisCostState = {
  accumulators: AxisBucketCostState[];
};

function axisStateKey(group: (typeof RESEARCH_AXIS_GROUPS)[number]): string {
  return group.atlasSource.stateKey;
}

function createAxisBucketCostState(input: {
  bucketId: string;
  bucketLabel: string;
}): AxisBucketCostState {
  const cohorts = new Map<SpreadCohortId, CostAwareBucketAccumulatorState>();

  for (const cohortId of COST_AWARE_SPREAD_COHORT_ORDER) {
    cohorts.set(cohortId, createCostAwareBucketAccumulatorState());
  }

  return {
    bucketId: input.bucketId,
    bucketLabel: input.bucketLabel,
    cohorts,
    derivedObservations: 0,
    officialObservations: 0,
    unknownSettlementObservations: 0,
  };
}

export type CostAwareAtlasAccumulatorState = {
  axisStates: Map<string, AxisCostState>;
  totalObservations: number;
  derivedObservations: number;
  officialObservations: number;
};

export function createCostAwareAtlasAccumulatorState(input?: {
  regimeVolatilityByMarket?: ReadonlyMap<string, "low" | "medium" | "high">;
}): CostAwareAtlasAccumulatorState {
  const regimeVolatilityByMarket = input?.regimeVolatilityByMarket;
  const axisStates = new Map<string, AxisCostState>();

  for (const group of listRegistryAxisGroupsForAtlas()) {
    if (group.requiresRegimeVolatility && !regimeVolatilityByMarket) {
      axisStates.set(axisStateKey(group), { accumulators: [] });
      continue;
    }

    const bucketAccumulators = createAccumulatorsForAxisGroup(group);
    axisStates.set(axisStateKey(group), {
      accumulators: bucketAccumulators.map((accumulator) =>
        createAxisBucketCostState({
          bucketId: accumulator.bucketId,
          bucketLabel: accumulator.bucketLabel,
        }),
      ),
    });
  }

  return {
    axisStates,
    totalObservations: 0,
    derivedObservations: 0,
    officialObservations: 0,
  };
}

function recordSettlementSource(
  bucketState: AxisBucketCostState,
  settlementSource: SettlementSourceStatus,
): void {
  if (settlementSource === "derived") {
    bucketState.derivedObservations += 1;
    return;
  }

  if (settlementSource === "official") {
    bucketState.officialObservations += 1;
    return;
  }

  bucketState.unknownSettlementObservations += 1;
}

function ingestCostAwareObservationForBucket(
  bucketState: AxisBucketCostState,
  observation: CostAwareMispricingObservation,
  config: CostAwareAtlasConfig,
): void {
  recordSettlementSource(bucketState, observation.settlementSource);

  const quote = {
    yesBidCents: observation.yesBidCents,
    yesAskCents: observation.yesAskCents,
    spreadPercent: observation.spreadPercent,
    quoteStatus: observation.quoteStatus,
  };

  for (const cohortId of COST_AWARE_SPREAD_COHORT_ORDER) {
    if (!observationMatchesSpreadCohort(cohortId, quote, config)) {
      continue;
    }

    addObservationToCostAwareBucketState(
      bucketState.cohorts.get(cohortId)!,
      {
        predictedProbability: observation.predictedProbability,
        observedOutcome: observation.observedOutcome,
        quote,
        config,
      },
    );
  }
}

export function ingestCostAwareObservation(
  state: CostAwareAtlasAccumulatorState,
  observation: CostAwareMispricingObservation,
  config: CostAwareAtlasConfig,
  options?: {
    regimeVolatilityByMarket?: ReadonlyMap<string, "low" | "medium" | "high">;
  },
): void {
  state.totalObservations += 1;

  if (observation.settlementSource === "derived") {
    state.derivedObservations += 1;
  } else if (observation.settlementSource === "official") {
    state.officialObservations += 1;
  }

  const matchObservation: MispricingObservation = {
    strategyId: observation.strategyId,
    seriesTicker: observation.seriesTicker,
    marketTicker: observation.marketTicker,
    outputPath: observation.outputPath,
    stepIndex: observation.stepIndex,
    predictedProbability: observation.predictedProbability ?? Number.NaN,
    observedOutcome: observation.observedOutcome,
    timeRemainingMs: observation.timeRemainingMs,
    moneynessPercent: observation.moneynessPercent,
    annualizedVolatility: observation.annualizedVolatility,
    momentumPercent: observation.momentumPercent,
    tradingDayUtc: observation.tradingDayUtc,
    timestampMs: observation.timestampMs,
  };

  const metrics =
    observation.predictedProbability == null
      ? {
          predictedProbability: Number.NaN,
          observedOutcome: observation.observedOutcome,
          tradingDayUtc: observation.tradingDayUtc,
        }
      : {
          predictedProbability: observation.predictedProbability,
          observedOutcome: observation.observedOutcome,
          tradingDayUtc: observation.tradingDayUtc,
        };

  const regimeVolatilityByMarket = options?.regimeVolatilityByMarket;

  for (const group of listRegistryAxisGroupsForAtlas()) {
    if (group.requiresRegimeVolatility && !regimeVolatilityByMarket) {
      continue;
    }

    const axisState = state.axisStates.get(axisStateKey(group));
    if (!axisState || axisState.accumulators.length === 0) {
      continue;
    }

    ingestObservationForAxisGroup({
      group,
      accumulators: axisState.accumulators.map((entry) => ({
        bucketId: entry.bucketId,
        bucketLabel: entry.bucketLabel,
        count: 0,
        sumPredicted: 0,
        sumOutcome: 0,
        sumSquaredError: 0,
        sumAbsError: 0,
        tradingDays: new Set<string>(),
      })),
      observation: matchObservation,
      metrics,
      addObservation: (accumulator) => {
        const bucketState = axisState.accumulators.find(
          (entry) => entry.bucketId === accumulator.bucketId,
        );
        if (!bucketState) {
          return;
        }

        ingestCostAwareObservationForBucket(bucketState, observation, config);
      },
      regimeVolatilityByMarket,
    });
  }
}

function resolveSettlementSourceStatus(
  bucketState: AxisBucketCostState,
): SettlementSourceStatus {
  const total =
    bucketState.derivedObservations
    + bucketState.officialObservations
    + bucketState.unknownSettlementObservations;

  if (total === 0) {
    return "unknown";
  }

  if (bucketState.derivedObservations > bucketState.officialObservations) {
    return "derived";
  }

  if (bucketState.officialObservations > 0) {
    return "official";
  }

  return "unknown";
}

function finalizeCohortMetrics(
  cohortId: SpreadCohortId,
  state: CostAwareBucketAccumulatorState,
  config: CostAwareAtlasConfig,
): CostAwareCohortMetrics {
  const metrics = computeBucketCostMetrics({ state, config });
  const tradeability = classifyTradeability({
    observations: state.observations,
    validQuoteObservations: state.validQuoteObservations,
    wideSpreadObservations: state.wideSpreadObservations,
    missingQuoteObservations: state.missingQuoteObservations,
    grossExpectedValueCents: metrics.grossExpectedValueCents,
    feeAdjustedExpectedValueCents: metrics.feeAdjustedExpectedValueCents,
    config,
  });

  return {
    cohortId,
    observations: state.observations,
    validQuoteObservations: state.validQuoteObservations,
    ...metrics,
    tradeability,
  };
}

export function finalizeCostAwareBucketEntries(input: {
  config: CostAwareAtlasConfig;
  atlasBucketReferences: readonly MispricingAtlasBucketReference[];
  state: CostAwareAtlasAccumulatorState;
}): CostAwareBucketEntry[] {
  const atlasByKey = new Map(
    input.atlasBucketReferences.map((entry) => [
      `${entry.dimension}::${entry.bucket.bucketId}`,
      entry,
    ]),
  );
  const entries: CostAwareBucketEntry[] = [];

  for (const [stateKey, axisState] of input.state.axisStates.entries()) {
    const group = RESEARCH_AXIS_GROUPS.find(
      (candidate) => candidate.atlasSource.stateKey === stateKey,
    );
    const dimension = group?.groupId ?? stateKey;

    for (const bucketState of axisState.accumulators) {
      const atlasRef = atlasByKey.get(`${dimension}::${bucketState.bucketId}`);
      const cohorts = COST_AWARE_SPREAD_COHORT_ORDER.map((cohortId) =>
        finalizeCohortMetrics(
          cohortId,
          bucketState.cohorts.get(cohortId)!,
          input.config,
        ),
      );
      const primaryCohort =
        cohorts.find((cohort) => cohort.cohortId === "validBidAsk")
        ?? cohorts.find((cohort) => cohort.cohortId === "all")
        ?? cohorts[0]!;

      entries.push({
        dimension,
        bucketId: bucketState.bucketId,
        bucketLabel: bucketState.bucketLabel,
        atlasCalibrationError: atlasRef?.bucket.calibrationError ?? null,
        atlasObservations: atlasRef?.bucket.observations ?? 0,
        settlementSourceStatus: resolveSettlementSourceStatus(bucketState),
        cohorts,
        primaryCohort,
      });
    }
  }

  return entries.sort(compareBucketEntriesDeterministically);
}

export function buildMispricingAtlasBucketReferences(
  atlas: import("@/lib/data/research/mispricingAtlas/mispricingAtlasTypes").MispricingAtlas,
): MispricingAtlasBucketReference[] {
  return collectMispricingAtlasBucketGroups(atlas).flatMap((group) =>
    group.buckets.map((bucket) => ({
      dimension: group.dimension,
      bucket,
    })),
  );
}

export function ingestCostAwareMarketExtraction(
  state: CostAwareAtlasAccumulatorState,
  observations: readonly CostAwareMispricingObservation[],
  config: CostAwareAtlasConfig,
  options?: {
    regimeVolatilityByMarket?: ReadonlyMap<string, "low" | "medium" | "high">;
  },
): void {
  for (const observation of observations) {
    ingestCostAwareObservation(state, observation, config, options);
  }
}

export function toMispricingObservations(
  observations: readonly CostAwareMispricingObservation[],
): MispricingObservation[] {
  return observations
    .map((observation) => toMispricingObservation(observation))
    .filter((observation): observation is MispricingObservation => observation !== null);
}
