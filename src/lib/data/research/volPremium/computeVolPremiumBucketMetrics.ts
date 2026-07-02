import {
  MONEYNESS_BUCKET_DEFINITIONS,
  TIME_REMAINING_BUCKET_DEFINITIONS,
  VOLATILITY_BUCKET_DEFINITIONS,
  valueFitsBucket,
  type NumericBucketDefinition,
} from "@/lib/data/research/mispricingAtlas/mispricingAtlasBuckets";

export const VOL_PREMIUM_BUCKET_DEFINITIONS: readonly NumericBucketDefinition[] = [
  {
    bucketId: "premium-under-20pct",
    bucketLabel: "Underpriced vol (< -20pp)",
    minInclusive: Number.NEGATIVE_INFINITY,
    maxExclusive: -0.2,
  },
  {
    bucketId: "premium-mild-under",
    bucketLabel: "Mild underpricing (-20pp to 0)",
    minInclusive: -0.2,
    maxExclusive: 0,
  },
  {
    bucketId: "premium-mild-over",
    bucketLabel: "Mild overpricing (0 to +20pp)",
    minInclusive: 0,
    maxExclusive: 0.2,
  },
  {
    bucketId: "premium-over-20pct",
    bucketLabel: "Overpriced vol (>= +20pp)",
    minInclusive: 0.2,
    maxExclusive: null,
  },
];
import type {
  MarketStateRegimeTag,
  TrendRegimeTag,
  VolatilityRegimeTag,
} from "@/lib/data/research/regimeTagging/regimeTaggingTypes";

import { roundVolMetric } from "./volPremiumMath";
import {
  ImpliedVolatilityInversionCode,
  type VolPremiumBucketSummary,
  type VolPremiumInversionCounts,
  type VolPremiumMarketSummary,
  type VolPremiumObservation,
  type VolPremiumOverallSummary,
} from "./volPremiumTypes";

function average(values: readonly number[]): number | null {
  if (values.length === 0) {
    return null;
  }

  return values.reduce((total, value) => total + value, 0) / values.length;
}

function createEmptyInversionCounts(): VolPremiumInversionCounts {
  return {
    [ImpliedVolatilityInversionCode.OK]: 0,
    [ImpliedVolatilityInversionCode.BOUNDARY_PROBABILITY]: 0,
    [ImpliedVolatilityInversionCode.ATM_MISMATCH]: 0,
    [ImpliedVolatilityInversionCode.MISSING_INPUT]: 0,
    [ImpliedVolatilityInversionCode.ZERO_TIME]: 0,
  };
}

export function computeVolPremiumBucketSummary(
  bucketId: string,
  bucketLabel: string,
  observations: readonly VolPremiumObservation[],
): VolPremiumBucketSummary {
  const impliedValues = observations
    .map((observation) => observation.impliedVolatilityAnnualized)
    .filter((value): value is number => value !== null);
  const realizedValues = observations
    .map((observation) => observation.realizedVolatilityForwardAnnualized)
    .filter((value): value is number => value !== null);
  const premiumValues = observations
    .map((observation) => observation.volPremium)
    .filter((value): value is number => value !== null);

  const averageImplied = average(impliedValues);
  const averageRealized = average(realizedValues);
  const averagePremium = average(premiumValues);

  return {
    bucketId,
    bucketLabel,
    observations: observations.length,
    averageImpliedVolatility:
      averageImplied === null ? null : roundVolMetric(averageImplied),
    averageRealizedVolatilityForward:
      averageRealized === null ? null : roundVolMetric(averageRealized),
    averageVolPremium:
      averagePremium === null ? null : roundVolMetric(averagePremium),
  };
}

export function computeOverallVolPremiumSummary(
  observations: readonly VolPremiumObservation[],
): VolPremiumOverallSummary {
  const inversionCounts = createEmptyInversionCounts();

  for (const observation of observations) {
    inversionCounts[observation.inversionCode] += 1;
  }

  const invertible = observations.filter(
    (observation) => observation.inversionCode === ImpliedVolatilityInversionCode.OK,
  );
  const premiumObservations = invertible.filter(
    (observation) => observation.volPremium !== null,
  );

  const averageImplied = average(
    invertible
      .map((observation) => observation.impliedVolatilityAnnualized)
      .filter((value): value is number => value !== null),
  );
  const averageRealized = average(
    premiumObservations
      .map((observation) => observation.realizedVolatilityForwardAnnualized)
      .filter((value): value is number => value !== null),
  );
  const averagePremium = average(
    premiumObservations
      .map((observation) => observation.volPremium)
      .filter((value): value is number => value !== null),
  );

  return {
    observations: observations.length,
    invertibleObservations: invertible.length,
    averageImpliedVolatility:
      averageImplied === null ? null : roundVolMetric(averageImplied),
    averageRealizedVolatilityForward:
      averageRealized === null ? null : roundVolMetric(averageRealized),
    averageVolPremium:
      averagePremium === null ? null : roundVolMetric(averagePremium),
    inversionCounts,
  };
}

function computeNumericAxisBucketSummaries(
  observations: readonly VolPremiumObservation[],
  definitions: readonly NumericBucketDefinition[],
  readValue: (observation: VolPremiumObservation) => number | null,
): VolPremiumBucketSummary[] {
  return definitions.map((definition) => {
    const inBucket = observations.filter((observation) => {
      const value = readValue(observation);
      return value !== null && valueFitsBucket(value, definition);
    });

    return computeVolPremiumBucketSummary(
      definition.bucketId,
      definition.bucketLabel,
      inBucket,
    );
  });
}

export function computeTimeRemainingVolPremiumBuckets(
  observations: readonly VolPremiumObservation[],
): VolPremiumBucketSummary[] {
  return computeNumericAxisBucketSummaries(
    observations,
    TIME_REMAINING_BUCKET_DEFINITIONS,
    (observation) => observation.timeRemainingMs,
  );
}

export function computeMoneynessVolPremiumBuckets(
  observations: readonly VolPremiumObservation[],
): VolPremiumBucketSummary[] {
  return computeNumericAxisBucketSummaries(
    observations,
    MONEYNESS_BUCKET_DEFINITIONS,
    (observation) => observation.moneynessPercent,
  );
}

export function computeImpliedVolatilityVolPremiumBuckets(
  observations: readonly VolPremiumObservation[],
): VolPremiumBucketSummary[] {
  return computeNumericAxisBucketSummaries(
    observations,
    VOLATILITY_BUCKET_DEFINITIONS,
    (observation) => observation.impliedVolatilityAnnualized,
  );
}

export function computeRealizedVolatilityVolPremiumBuckets(
  observations: readonly VolPremiumObservation[],
): VolPremiumBucketSummary[] {
  return computeNumericAxisBucketSummaries(
    observations,
    VOLATILITY_BUCKET_DEFINITIONS,
    (observation) => observation.realizedVolatilityForwardAnnualized,
  );
}

export function computeVolPremiumAxisBuckets(
  observations: readonly VolPremiumObservation[],
): VolPremiumBucketSummary[] {
  return computeNumericAxisBucketSummaries(
    observations,
    VOL_PREMIUM_BUCKET_DEFINITIONS,
    (observation) => observation.volPremium,
  );
}

function buildMarketJoinKey(observation: VolPremiumObservation): string {
  return `${observation.strategyId}/${observation.seriesTicker}/${observation.marketTicker}`;
}

export function computeMarketVolPremiumSummaries(
  observations: readonly VolPremiumObservation[],
): VolPremiumMarketSummary[] {
  const grouped = new Map<string, VolPremiumObservation[]>();

  for (const observation of observations) {
    const key = buildMarketJoinKey(observation);
    const bucket = grouped.get(key) ?? [];
    bucket.push(observation);
    grouped.set(key, bucket);
  }

  return [...grouped.entries()]
    .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
    .map(([, marketObservations]) => {
      const first = marketObservations[0]!;
      const inversionCounts = createEmptyInversionCounts();

      for (const observation of marketObservations) {
        inversionCounts[observation.inversionCode] += 1;
      }

      const invertible = marketObservations.filter(
        (observation) => observation.inversionCode === ImpliedVolatilityInversionCode.OK,
      );
      const premiumObservations = invertible.filter(
        (observation) => observation.volPremium !== null,
      );

      const averageImplied = average(
        invertible
          .map((observation) => observation.impliedVolatilityAnnualized)
          .filter((value): value is number => value !== null),
      );
      const averageRealized = average(
        premiumObservations
          .map((observation) => observation.realizedVolatilityForwardAnnualized)
          .filter((value): value is number => value !== null),
      );
      const averagePremium = average(
        premiumObservations
          .map((observation) => observation.volPremium)
          .filter((value): value is number => value !== null),
      );

      return {
        strategyId: first.strategyId,
        seriesTicker: first.seriesTicker,
        marketTicker: first.marketTicker,
        outputPath: first.outputPath,
        observationCount: marketObservations.length,
        invertibleObservationCount: invertible.length,
        averageImpliedVolatility:
          averageImplied === null ? null : roundVolMetric(averageImplied),
        averageRealizedVolatilityForward:
          averageRealized === null ? null : roundVolMetric(averageRealized),
        averageVolPremium:
          averagePremium === null ? null : roundVolMetric(averagePremium),
        inversionCounts,
      };
    });
}

function computeRegimeAxisBucketSummaries<T extends string>(
  observations: readonly VolPremiumObservation[],
  definitions: readonly { bucketId: string; bucketLabel: string; tag: T }[],
  readTag: (observation: VolPremiumObservation) => T | null,
): VolPremiumBucketSummary[] {
  return definitions.map((definition) => {
    const inBucket = observations.filter(
      (observation) => readTag(observation) === definition.tag,
    );

    return computeVolPremiumBucketSummary(
      definition.bucketId,
      definition.bucketLabel,
      inBucket,
    );
  });
}

const VOLATILITY_REGIME_BUCKET_DEFINITIONS: readonly {
  bucketId: string;
  bucketLabel: string;
  tag: VolatilityRegimeTag;
}[] = [
  { bucketId: "regime-vol-low", bucketLabel: "Regime volatility: low", tag: "low" },
  { bucketId: "regime-vol-medium", bucketLabel: "Regime volatility: medium", tag: "medium" },
  { bucketId: "regime-vol-high", bucketLabel: "Regime volatility: high", tag: "high" },
];

const TREND_REGIME_BUCKET_DEFINITIONS: readonly {
  bucketId: string;
  bucketLabel: string;
  tag: TrendRegimeTag;
}[] = [
  { bucketId: "regime-trend-uptrend", bucketLabel: "Regime trend: uptrend", tag: "uptrend" },
  { bucketId: "regime-trend-downtrend", bucketLabel: "Regime trend: downtrend", tag: "downtrend" },
  { bucketId: "regime-trend-sideways", bucketLabel: "Regime trend: sideways", tag: "sideways" },
];

const MARKET_STATE_REGIME_BUCKET_DEFINITIONS: readonly {
  bucketId: string;
  bucketLabel: string;
  tag: MarketStateRegimeTag;
}[] = [
  { bucketId: "regime-state-quiet", bucketLabel: "Regime market state: quiet", tag: "quiet" },
  { bucketId: "regime-state-trending", bucketLabel: "Regime market state: trending", tag: "trending" },
  { bucketId: "regime-state-reversal", bucketLabel: "Regime market state: reversal", tag: "reversal" },
  { bucketId: "regime-state-choppy", bucketLabel: "Regime market state: choppy", tag: "choppy" },
];

export function computeRegimeVolatilityVolPremiumBuckets(
  observations: readonly VolPremiumObservation[],
): VolPremiumBucketSummary[] {
  return computeRegimeAxisBucketSummaries(
    observations,
    VOLATILITY_REGIME_BUCKET_DEFINITIONS,
    (observation) => observation.regimeTags?.volatility ?? null,
  );
}

export function computeRegimeTrendVolPremiumBuckets(
  observations: readonly VolPremiumObservation[],
): VolPremiumBucketSummary[] {
  return computeRegimeAxisBucketSummaries(
    observations,
    TREND_REGIME_BUCKET_DEFINITIONS,
    (observation) => observation.regimeTags?.trend ?? null,
  );
}

export function computeRegimeMarketStateVolPremiumBuckets(
  observations: readonly VolPremiumObservation[],
): VolPremiumBucketSummary[] {
  return computeRegimeAxisBucketSummaries(
    observations,
    MARKET_STATE_REGIME_BUCKET_DEFINITIONS,
    (observation) => observation.regimeTags?.marketState ?? null,
  );
}
