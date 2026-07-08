import { estimateRealizedVolatility } from "@/lib/data/strategies/fairValueDiffusion/fairValueDiffusionModel";
import { computeResearchObservationMomentumPercent } from "@/lib/data/research/dimensions/momentum/computeResearchObservationMomentumPercent";
import {
  extractDayOfWeekUtc,
  extractHourUtc,
  extractSessionBucketCode,
  extractWeekendFlag,
} from "@/lib/data/research/dimensions/temporalBucketDefinitions";
import { percentToTarget } from "@/lib/features/targetDistance";
import type { EvaluationCandleSnapshot } from "@/types/domain/trading";

import {
  DEFAULT_MISPRICING_VOLATILITY_LOOKBACK_BARS,
  type MispricingObservation,
} from "./mispricingAtlasTypes";
import type {
  ComputedResearchFeatures,
  ResearchObservationEnrichmentContext,
} from "./researchObservationFeaturesTypes";

function normalizeTimestampMs(value: number | null | undefined): number | null {
  if (value === undefined || value === null || !Number.isFinite(value)) {
    return null;
  }

  return value;
}

function toTradingDayUtc(timestampMs: number): string {
  return new Date(timestampMs).toISOString().slice(0, 10);
}

function readAnnualizedVolatility(
  candles: readonly EvaluationCandleSnapshot[],
  lookbackBars: number,
): number | null {
  const estimate = estimateRealizedVolatility(candles, lookbackBars);
  return estimate?.annualizedVol ?? null;
}

function extractTemporalFeatures(timestampMs: number | null): Pick<
  ComputedResearchFeatures,
  "hourUtc" | "dayOfWeekUtc" | "sessionBucketCode" | "weekendFlag"
> {
  if (timestampMs === null) {
    return {
      hourUtc: null,
      dayOfWeekUtc: null,
      sessionBucketCode: null,
      weekendFlag: null,
    };
  }

  const observation = { timestampMs } as MispricingObservation;

  return {
    hourUtc: extractHourUtc(observation),
    dayOfWeekUtc: extractDayOfWeekUtc(observation),
    sessionBucketCode: extractSessionBucketCode(observation),
    weekendFlag: extractWeekendFlag(observation),
  };
}

/** Computes canonical research observation features from replay/snapshot context. */
export function enrichResearchObservationFeatures(
  ctx: ResearchObservationEnrichmentContext,
): ComputedResearchFeatures {
  const moneynessPercent =
    ctx.spotPrice !== null && ctx.strikePrice !== null
      ? percentToTarget(ctx.spotPrice, ctx.strikePrice).percent
      : null;

  const lookbackBars =
    ctx.volatilityLookbackBars ?? DEFAULT_MISPRICING_VOLATILITY_LOOKBACK_BARS;
  const annualizedVolatility =
    ctx.candles.length > 0 ? readAnnualizedVolatility(ctx.candles, lookbackBars) : null;
  const momentumPercent =
    ctx.candles.length > 0
      ? computeResearchObservationMomentumPercent(ctx.candles)
      : null;

  const timestampMs = normalizeTimestampMs(ctx.observationTimestampMs);
  const tradingDayUtc = timestampMs !== null ? toTradingDayUtc(timestampMs) : null;

  return {
    timeRemainingMs: ctx.timeRemainingMs,
    moneynessPercent,
    annualizedVolatility,
    momentumPercent,
    timestampMs,
    tradingDayUtc,
    ...extractTemporalFeatures(timestampMs),
  };
}

/** Maps computed features onto legacy top-level observation fields. */
export function applyComputedFeaturesToObservationFields(
  features: ComputedResearchFeatures,
): Pick<
  MispricingObservation,
  | "timeRemainingMs"
  | "moneynessPercent"
  | "annualizedVolatility"
  | "momentumPercent"
  | "tradingDayUtc"
  | "timestampMs"
> {
  return {
    timeRemainingMs: features.timeRemainingMs,
    moneynessPercent: features.moneynessPercent,
    annualizedVolatility: features.annualizedVolatility,
    momentumPercent: features.momentumPercent,
    tradingDayUtc: features.tradingDayUtc,
    timestampMs: features.timestampMs,
  };
}
