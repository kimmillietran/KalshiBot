import type { LiquidityQuality } from "@/types/domain/trading";

import type {
  ContractTimeRemainingFeature,
  FeatureExtractionInput,
  FeaturePricingInput,
  LiquidityScoreFeature,
  MarketFeatureVector,
  MinutesUntilSettlementFeature,
  SpreadPercentFeature,
  VolumeBucketFeature,
} from "./types";
import { crossedTargetRecently, distanceToTarget, percentToTarget } from "./targetDistance";
import { higherHighs, higherLows, lastCandleDirection } from "./candleFeatures";
import { priceAcceleration, priceVelocity, recentMomentum } from "./momentum";
import { rollingVolatility } from "./volatility";
import { trendStrength } from "./trend";

const MS_PER_MINUTE = 60_000;

const LIQUIDITY_SCORE: Record<LiquidityQuality, number> = {
  Poor: 25,
  Fair: 50,
  Good: 75,
  Excellent: 100,
};

export function minutesUntilSettlement(
  timeRemainingMs: number,
): MinutesUntilSettlementFeature {
  const expired = timeRemainingMs <= 0;
  return {
    minutes: expired ? 0 : timeRemainingMs / MS_PER_MINUTE,
    expired,
  };
}

export function contractTimeRemaining(
  timeRemainingMs: number,
): ContractTimeRemainingFeature {
  const expired = timeRemainingMs <= 0;
  return {
    ms: Math.max(timeRemainingMs, 0),
    expired,
    minutes: expired ? 0 : timeRemainingMs / MS_PER_MINUTE,
  };
}

export function spreadPercent(pricing: FeaturePricingInput): SpreadPercentFeature {
  const yesSpreadPercent = spreadSidePercent(pricing.yesBidCents, pricing.yesAskCents);
  const noSpreadPercent = spreadSidePercent(pricing.noBidCents, pricing.noAskCents);

  const spreads = [yesSpreadPercent, noSpreadPercent].filter(
    (value): value is number => value !== null,
  );

  return {
    yesSpreadPercent,
    noSpreadPercent,
    maxSpreadPercent: spreads.length === 0 ? null : Math.max(...spreads),
  };
}

function spreadSidePercent(
  bidCents: number | null,
  askCents: number | null,
): number | null {
  if (bidCents == null || askCents == null || askCents <= 0) {
    return null;
  }

  const spread = Math.max(askCents - bidCents, 0);
  return (spread / askCents) * 100;
}

export function liquidityScore(pricing: FeaturePricingInput): LiquidityScoreFeature {
  return {
    score: LIQUIDITY_SCORE[pricing.liquidityQuality],
    quality: pricing.liquidityQuality,
  };
}

export function volumeBucket(volumeDollars: number | null): VolumeBucketFeature {
  if (volumeDollars == null || !Number.isFinite(volumeDollars) || volumeDollars <= 0) {
    return { bucket: "unknown", dollars: null };
  }

  if (volumeDollars >= 500_000) {
    return { bucket: "high", dollars: volumeDollars };
  }

  if (volumeDollars >= 50_000) {
    return { bucket: "medium", dollars: volumeDollars };
  }

  return { bucket: "low", dollars: volumeDollars };
}

/** Assemble a full deterministic feature vector from raw market inputs. */
export function buildMarketFeatureVector(
  input: FeatureExtractionInput,
): MarketFeatureVector {
  const { spotPrice, candles, market, pricing } = input;
  const crossLookback = input.crossLookback ?? 5;

  return {
    distanceToTarget: distanceToTarget(spotPrice, market.strikePrice),
    percentToTarget: percentToTarget(spotPrice, market.strikePrice),
    crossedTargetRecently: crossedTargetRecently(
      candles,
      market.strikePrice,
      crossLookback,
    ),
    lastCandleDirection: lastCandleDirection(candles),
    higherHighs: higherHighs(candles),
    higherLows: higherLows(candles),
    volatility: rollingVolatility(candles),
    momentum: recentMomentum(candles),
    priceVelocity: priceVelocity(candles),
    priceAcceleration: priceAcceleration(candles),
    trend: trendStrength(candles),
    minutesUntilSettlement: minutesUntilSettlement(market.timeRemainingMs),
    timeRemaining: contractTimeRemaining(market.timeRemainingMs),
    spreadPercent: spreadPercent(pricing),
    liquidity: liquidityScore(pricing),
    volume: volumeBucket(pricing.volumeDollars),
  };
}
