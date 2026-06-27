import type { LiquidityQuality } from "@/types/domain/trading";

/** OHLC candle for feature extraction — timestamps supplied by caller. */
export type FeatureCandle = {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
};

export type FeaturePricingInput = {
  yesBidCents: number | null;
  yesAskCents: number | null;
  noBidCents: number | null;
  noAskCents: number | null;
  /** Raw dollar volume or liquidity depth when available. */
  volumeDollars: number | null;
  liquidityQuality: LiquidityQuality;
};

export type FeatureMarketInput = {
  strikePrice: number;
  timeRemainingMs: number;
  closeTime: string | null;
};

/** Raw inputs for feature extraction — no side effects, caller supplies clock. */
export type FeatureExtractionInput = {
  evaluatedAtMs: number;
  spotPrice: number;
  candles: readonly FeatureCandle[];
  market: FeatureMarketInput;
  pricing: FeaturePricingInput;
  /** Recent bars inspected for target cross detection. Default: 5. */
  crossLookback?: number;
};

export type DistanceToTargetFeature = {
  absolute: number;
  signed: number;
  isAboveTarget: boolean;
};

export type PercentToTargetFeature = {
  percent: number;
};

export type CrossedTargetRecentlyFeature = {
  crossed: boolean;
  direction: "up" | "down" | null;
  barsAgo: number | null;
};

export type LastCandleDirectionFeature = {
  direction: "up" | "down" | "flat" | null;
  change: number;
};

export type HigherHighsFeature = {
  streak: number;
  isRising: boolean;
};

export type HigherLowsFeature = {
  streak: number;
  isRising: boolean;
};

export type RollingVolatilityFeature = {
  stdDev: number;
  coefficientOfVariation: number;
  bars: number;
};

export type RecentMomentumFeature = {
  change: number;
  changePercent: number;
  bars: number;
};

export type PriceVelocityFeature = {
  perBar: number;
  perMinute: number;
};

export type PriceAccelerationFeature = {
  deltaVelocityPerBar: number;
};

export type TrendStrengthFeature = {
  score: number;
  direction: "bullish" | "bearish" | "neutral";
  slopePerBar: number;
};

export type MinutesUntilSettlementFeature = {
  minutes: number;
  expired: boolean;
};

export type ContractTimeRemainingFeature = {
  ms: number;
  expired: boolean;
  minutes: number;
};

export type SpreadPercentFeature = {
  yesSpreadPercent: number | null;
  noSpreadPercent: number | null;
  maxSpreadPercent: number | null;
};

export type LiquidityScoreFeature = {
  score: number;
  quality: LiquidityQuality;
};

export type VolumeBucketFeature = {
  bucket: "unknown" | "low" | "medium" | "high";
  dollars: number | null;
};

/** Deterministic feature bundle for downstream engine / model layers. */
export type MarketFeatureVector = {
  distanceToTarget: DistanceToTargetFeature;
  percentToTarget: PercentToTargetFeature;
  crossedTargetRecently: CrossedTargetRecentlyFeature;
  lastCandleDirection: LastCandleDirectionFeature;
  higherHighs: HigherHighsFeature;
  higherLows: HigherLowsFeature;
  volatility: RollingVolatilityFeature;
  momentum: RecentMomentumFeature;
  priceVelocity: PriceVelocityFeature;
  priceAcceleration: PriceAccelerationFeature;
  trend: TrendStrengthFeature;
  minutesUntilSettlement: MinutesUntilSettlementFeature;
  timeRemaining: ContractTimeRemainingFeature;
  spreadPercent: SpreadPercentFeature;
  liquidity: LiquidityScoreFeature;
  volume: VolumeBucketFeature;
};
